import bolt from '@slack/bolt';
import { randomUUID } from 'node:crypto';
import type { Config } from '../../config.js';
import { home } from '../../config.js';
import { Store } from '../../store.js';
import { CodexRpc, type RpcMessage } from '../../runtimes/codex/rpc.js';
import { CodexAdapter } from '../../runtimes/codex/adapter.js';
import { Approvals } from '../../approvals.js';
import { classify, selectSession, statusText, awaitsConversationalReply } from '../../router.js';
import { log, failure, slackLogger } from '../../log.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { App, SocketModeReceiver } = bolt;
export { authorized } from './ingress.js';
import { authorized, SlackIngress } from './ingress.js';
export class SlackBridge {
  readonly app: InstanceType<typeof App>;
  readonly receiver: InstanceType<typeof SocketModeReceiver>;
  private slackConnected = false;
  private ingress: SlackIngress;
  readonly rpc = new CodexRpc();
  readonly adapter = new CodexAdapter(this.rpc);
  readonly approvals: Approvals;
  private running = false;
  private timer?: NodeJS.Timeout;
  private busy = false;
  private reconnectAt = 0;
  private backoff = 1000;
  private subscribed = new Set<string>();
  private serial = Promise.resolve();
  private nextPostAt = 0;
  private nextPruneAt = 0;
  private nextEnsureAt = 0;
  constructor(
    readonly config: Config,
    readonly store: Store,
    botToken: string,
    appToken: string,
    pairingCode?: string,
    private ensureRuntime?: () => Promise<void>,
  ) {
    this.approvals = new Approvals(store, this.rpc);
    this.ingress = new SlackIngress(config, store, () => this.rpc.connected, pairingCode);
    store.invalidateApprovals();
    this.receiver = new SocketModeReceiver({
      appToken,
      logger: slackLogger,
      logLevel: bolt.LogLevel.ERROR,
      customPropertiesExtractor: ({ body }: any) => {
        this.ingress.receive(body);
        return {};
      },
    });
    this.receiver.client.on('connected', () => {
      this.slackConnected = true;
    });
    for (const event of ['disconnected', 'reconnecting'])
      this.receiver.client.on(event, () => {
        this.slackConnected = false;
      });
    this.app = new App({
      token: botToken,
      logger: slackLogger,
      receiver: this.receiver,
      logLevel: bolt.LogLevel.ERROR,
      clientOptions: { timeout: 10000, retryConfig: { retries: 2 } },
    });
    this.app.error(async () => failure('slack_handler'));
    this.app.event('message', async () => {}); // persisted in the receiver before Bolt acknowledges it
    this.app.action(/^session_/, async ({ ack, body, action }: any) => {
      await ack();
      if (!authorized(config, body.team?.id, body.user?.id, body.channel?.id)) return;
      const root = body.message?.thread_ts || body.message?.ts;
      if (!root) return;
      const id = action.value;
      if (typeof id !== 'string') return;
      try {
        await this.adapter.assertLoaded(id);
        await this.adapter.attach(id);
        store.bind(body.channel.id, root, id);
        store.post(
          randomUUID(),
          body.channel.id,
          root,
          'Connected to the selected session. Send your instruction in this thread.',
        );
      } catch {
        store.post(
          randomUUID(),
          body.channel.id,
          root,
          'That session is unavailable. Ask for “sessions” again.',
        );
      }
    });
    this.app.action(/^approval_/, async ({ ack, body, action }: any) => {
      await ack();
      if (!authorized(config, body.team?.id, body.user?.id, body.channel?.id)) return;
      const root = body.message?.thread_ts || body.message?.ts;
      if (!root) return;
      try {
        this.approvals.resolve(
          action.value,
          body.channel.id,
          root,
          action.action_id === 'approval_accept' ? 'accept' : 'decline',
        );
        store.post(
          randomUUID(),
          body.channel.id,
          root,
          'Your one-time decision was sent to Codex. The runtime decides whether the request is still valid.',
        );
      } catch {
        store.post(
          randomUUID(),
          body.channel.id,
          root,
          'This approval is unavailable or already resolved. Check Codex for the current request.',
        );
      }
    });
    this.rpc.on('notification', (m) => this.schedule(() => this.notification(m)));
    this.rpc.on('request', (m) => this.approvals.receive(m));
    this.rpc.on('disconnected', () => {
      this.subscribed.clear();
      this.approvals.disconnect();
      log('codex_disconnected');
    });
  }
  private schedule(fn: () => Promise<void>) {
    this.serial = this.serial.then(fn).catch(() => failure('runtime_notification'));
  }
  private async notification(m: RpcMessage) {
    const p = m.params;
    if (m.method === 'serverRequest/resolved') {
      this.approvals.resolved(p.requestId);
      return;
    }
    if (!p?.threadId) return;
    const target = this.store.targets(p.threadId)[0];
    if (!target) return;
    if (m.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text) {
      this.store.post(`agent:${p.threadId}:${p.item.id}`, target.channel, target.root, p.item.text);
    }
    if (m.method === 'turn/completed') {
      const watch = this.store.db
        .prepare('SELECT * FROM watches WHERE session=?')
        .get(p.threadId) as any;
      if (watch && watch.turn === p.turn.id) {
        this.store.post(
          `completed:${p.threadId}:${p.turn.id}`,
          watch.channel,
          watch.root,
          `Codex turn ${p.turn.status}.`,
        );
        this.store.db.prepare('DELETE FROM watches WHERE session=?').run(p.threadId);
      }
    }
  }
  async start() {
    await this.app.start();
    this.running = true;
    log('slack_connected');
    this.timer = setInterval(() => void this.tick().catch(() => failure('bridge_tick')), 1000);
    await this.tick();
  }
  async stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    while (this.busy) await new Promise((r) => setTimeout(r, 25));
    await this.serial;
    await this.rpc.close();
    await this.app.stop();
  }
  private async choose(channel: string, root: string) {
    const sessions = await this.adapter.sessions();
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: sessions.length
            ? 'Choose a session. Instructions are sent only after a selection.'
            : 'No live sessions are available in the shared Codex daemon. Open Codex normally; private embedded runtimes cannot be controlled.',
        },
      },
    ];
    for (const s of sessions.slice(0, 20))
      blocks.push({
        type: 'section',
        text: {
          type: 'plain_text',
          text: `${s.project} — ${s.name} (${s.status})\n${s.cwd}`.slice(0, 2900),
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Connect' },
          action_id: `session_${s.id}`,
          value: s.id,
        },
      });
    this.store.post(randomUUID(), channel, root, 'Choose a Codex session', blocks);
  }
  private async route(row: any) {
    const { channel, root, text, id } = row;
    const intent = classify(text);
    if (intent === 'sessions') {
      await this.choose(channel, root);
      return;
    }
    if (
      (intent === 'instruction' || intent === 'ambiguous') &&
      this.approvals.answer(channel, root, text)
    ) {
      this.store.post(
        `reply:${id}`,
        channel,
        root,
        'Your answer was sent to the original Codex request.',
      );
      return;
    }
    const bound = this.store.binding(channel, root);
    const sessions = await this.adapter.sessions();
    const session = selectSession(sessions, bound);
    if (!session) {
      if (bound)
        this.store.post(
          `stale:${id}`,
          channel,
          root,
          'The mapped session is no longer loaded. Say “sessions” to select it explicitly. Your instruction was not sent.',
        );
      else await this.choose(channel, root);
      return;
    }
    this.store.bind(channel, root, session.id);
    if (intent === 'status') {
      this.store.post(
        `status:${id}`,
        channel,
        root,
        statusText(session, await this.adapter.snapshot(session.id)),
      );
      return;
    }
    const pendingNative = this.store.db
      .prepare(
        "SELECT token FROM approvals WHERE channel=? AND root=? AND status='pending' AND expires>? LIMIT 1",
      )
      .get(channel, root, Date.now());
    if (
      intent === 'ambiguous' &&
      (!bound ||
        pendingNative ||
        !awaitsConversationalReply(await this.adapter.snapshot(session.id)))
    ) {
      this.store.post(
        `ambiguous:${id}`,
        channel,
        root,
        'There is no single human-input request to answer here. Use the approval buttons, or send a specific instruction.',
      );
      return;
    }
    if (intent === 'watch') {
      const snapshot = await this.adapter.snapshot(session.id);
      if (snapshot.status.type !== 'active') {
        this.store.post(
          `watch:${id}`,
          channel,
          root,
          'This session is already idle. Ask for status to see its latest result.',
        );
        return;
      }
      await this.adapter.attach(session.id);
      this.store.db
        .prepare('INSERT OR REPLACE INTO watches VALUES(?,?,?,?)')
        .run(
          session.id,
          channel,
          root,
          snapshot.turns?.findLast((t: any) => t.status === 'inProgress')?.id || 'unavailable',
        );
      this.store.post(
        `watch:${id}`,
        channel,
        root,
        'I’ll notify you when the current Codex turn finishes.',
      );
      return;
    }
    if (intent === 'interrupt') {
      await this.adapter.interrupt(session.id);
      this.store.post(
        `interrupt:${id}`,
        channel,
        root,
        'Interruption requested for the active Codex turn.',
      );
      return;
    }
    const delivery = await this.adapter.deliver(session.id, text, `pigeon:${id}`);
    this.store.post(
      `delivered:${id}`,
      channel,
      root,
      `${session.project}: ${delivery.mode === 'steered' ? 'delivered to the active turn' : 'sent to the existing session'}.`,
    );
  }
  private async tick() {
    if (this.busy || !this.running) return;
    this.busy = true;
    try {
      if (!this.rpc.connected && Date.now() >= this.reconnectAt) {
        try {
          await this.rpc.connect();
          this.backoff = 1000;
          log('codex_connected');
        } catch {
          if (this.ensureRuntime && Date.now() >= this.nextEnsureAt) {
            this.nextEnsureAt = Date.now() + 30000;
            await this.ensureRuntime().catch(() => failure('codex_daemon_start'));
          }
          this.reconnectAt = Date.now() + this.backoff + Math.random() * 300;
          this.backoff = Math.min(30000, this.backoff * 2);
        }
      }
      this.store.expireQueued();
      if (this.rpc.connected && this.config.userId) {
        // Restore subscriptions only to exact currently loaded identities.
        for (const { session } of this.store.db
          .prepare('SELECT DISTINCT session FROM bindings')
          .all() as any[]) {
          if (!this.subscribed.has(session)) {
            try {
              await this.adapter.attach(session);
              this.subscribed.add(session);
              const snapshot = await this.adapter.snapshot(session);
              const latest = snapshot.turns?.at(-1);
              if (latest && latest.status !== 'inProgress')
                await this.notification({
                  method: 'turn/completed',
                  params: { threadId: session, turn: latest },
                });
              for (const item of snapshot.turns?.at(-1)?.items || [])
                if (item.type === 'agentMessage' && item.text)
                  await this.notification({
                    method: 'item/completed',
                    params: { threadId: session, item },
                  });
            } catch {}
          }
        }
        for (const row of this.store.queued()) {
          this.store.state(row.id, 'sending');
          try {
            await this.route(row);
            this.store.state(row.id, 'done');
          } catch {
            this.store.state(row.id, 'uncertain');
            this.store.post(
              `error:${row.id}`,
              row.channel,
              row.root,
              'Delivery could not be confirmed. I will not replay this instruction. Check the session before sending it again.',
            );
            failure('delivery');
          }
        }
      }
      this.approvals.expire();
      if (Date.now() >= this.nextPruneAt) {
        this.store.prune();
        this.nextPruneAt = Date.now() + 3600000;
      }
      for (const row of Date.now() >= this.nextPostAt ? this.store.outgoing().slice(0, 1) : []) {
        try {
          if (row.id.startsWith('approval:')) {
            const current = this.store.db
              .prepare('SELECT status FROM approvals WHERE token=?')
              .get(row.id.slice(9)) as any;
            if (current?.status !== 'pending') {
              this.store.sent(row.id);
              continue;
            }
          }
          await this.app.client.chat.postMessage({
            channel: row.channel,
            thread_ts: row.root,
            text: row.text,
            blocks: row.blocks ? JSON.parse(row.blocks) : undefined,
            unfurl_links: false,
            unfurl_media: false,
            parse: 'none',
          });
          this.nextPostAt = Date.now() + 1000;
          this.store.sent(row.id);
        } catch {
          this.nextPostAt = Date.now() + 30000;
          failure('slack_delivery');
          break;
        }
      }
      writeFileSync(
        join(home, 'health.json'),
        JSON.stringify({
          pid: process.pid,
          time: Date.now(),
          codex: this.rpc.connected,
          paired: !!this.config.userId,
          slack: this.slackConnected,
        }),
        { mode: 0o600 },
      );
    } finally {
      this.busy = false;
    }
  }
}
