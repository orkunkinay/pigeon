import bolt from '@slack/bolt';
import { randomUUID } from 'node:crypto';
import type { Config } from '../../config.js';
import { home, readConfig } from '../../config.js';
import { Store } from '../../store.js';
import { CodexRpc, type RpcMessage } from '../../runtimes/codex/rpc.js';
import { CodexAdapter } from '../../runtimes/codex/adapter.js';
import { Approvals } from '../../approvals.js';
import { Voice } from '../../conversation/voice.js';
import { statusReply } from '../../conversation/status.js';
import { Notifications } from '../../conversation/notifications.js';
import { classify, selectSession, awaitsConversationalReply } from '../../router.js';
import { log, failure, slackLogger } from '../../log.js';
import { writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { HumanCommunication } from '../../agent/coordinator.js';
import { serveAgentCalls } from '../../agent/ipc.js';
const { App, SocketModeReceiver } = bolt;
export { authorized } from './ingress.js';
import { authorized, SlackIngress } from './ingress.js';
export class SlackBridge {
  readonly app: InstanceType<typeof App>;
  readonly receiver: InstanceType<typeof SocketModeReceiver>;
  private slackConnected = false;
  private ingress: SlackIngress;
  private voice: Voice;
  private notifications: Notifications;
  private nextVoiceRefresh = 0;
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
  readonly human: HumanCommunication;
  private stopAgentCalls?: () => Promise<void>;
  constructor(
    readonly config: Config,
    readonly store: Store,
    botToken: string,
    appToken: string,
    pairingCode?: string,
    private ensureRuntime?: () => Promise<void>,
  ) {
    this.voice = new Voice(config.personality);
    this.human = new HumanCommunication(
      store,
      () => this.voice,
      () => ({
        connected: this.slackConnected,
        paired: !!config.userId,
        runtime: this.rpc.connected,
      }),
      async (id) => {
        try {
          return await this.adapter.assertLoaded(id);
        } catch {
          // MCP replies return through the calling runtime, including private exec servers.
          // Historical metadata is a label only: never resume it or claim live control.
          try {
            const { thread } = await this.rpc.call('thread/read', {
              threadId: id,
              includeTurns: false,
            });
            return { project: basename(thread.cwd) || 'Codex' };
          } catch {
            return { project: 'Codex' };
          }
        }
      },
      () => config.dmChannel,
      async (channel, text, id) => {
        const posted = await this.app.client.chat.postMessage({
          channel,
          text,
          unfurl_links: false,
          unfurl_media: false,
          parse: 'none',
        });
        if (!posted.ts) throw Error('Message acknowledgment missing');
        return posted.ts;
      },
    );
    this.notifications = new Notifications(
      store,
      () => this.voice,
      async (id) => {
        try {
          return (await this.adapter.assertLoaded(id)).project;
        } catch {
          return 'Codex';
        }
      },
    );
    this.approvals = new Approvals(store, this.rpc, () => this.voice);
    this.ingress = new SlackIngress(
      config,
      store,
      () => this.rpc.connected,
      pairingCode,
      undefined,
      () => this.voice,
    );
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
        const selected = await this.adapter.assertLoaded(id);
        await this.adapter.attach(id);
        store.bind(body.channel.id, root, id);
        store.post(
          randomUUID(),
          body.channel.id,
          root,
          this.voice.say('connected', { project: selected.project }),
        );
      } catch {
        store.post(randomUUID(), body.channel.id, root, this.voice.say('unavailable'));
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
        store.post(randomUUID(), body.channel.id, root, this.voice.say('decisionSent'));
      } catch {
        store.post(randomUUID(), body.channel.id, root, this.voice.say('approvalGone'));
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
    await this.notifications.handle(m);
  }

  async start() {
    await this.app.start();
    this.stopAgentCalls = await serveAgentCalls((call, signal) => this.human.call(call, signal));
    this.running = true;
    log('slack_connected');
    this.timer = setInterval(() => void this.tick().catch(() => failure('bridge_tick')), 1000);
    await this.tick();
  }
  async stop() {
    this.running = false;
    await this.stopAgentCalls?.();
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
          text: sessions.length ? this.voice.say('choose') : this.voice.say('noSessions'),
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
    this.store.post(randomUUID(), channel, root, this.voice.say('choose'), blocks);
  }
  private async route(row: any) {
    const { channel, root, text, id } = row;
    const intent = classify(text);
    if (
      intent !== 'interrupt' &&
      intent !== 'status' &&
      intent !== 'sessions' &&
      this.human?.answer(channel, root, text)
    )
      return;
    if (intent === 'sessions') {
      await this.choose(channel, root);
      return;
    }
    if (
      (intent === 'instruction' || intent === 'ambiguous') &&
      this.approvals.answer(channel, root, text)
    ) {
      this.store.post(`reply:${id}`, channel, root, this.voice.say('answerSent'));
      return;
    }
    const bound = this.store.binding(channel, root);
    const sessions = await this.adapter.sessions();
    const session = selectSession(sessions, bound);
    if (!session) {
      if (bound) this.store.post(`stale:${id}`, channel, root, this.voice.say('stale'));
      else await this.choose(channel, root);
      return;
    }
    this.store.bind(channel, root, session.id);
    if (intent === 'status') {
      const answer = statusReply(
        session,
        await this.adapter.snapshot(session.id),
        text,
        this.voice,
      );
      if (answer) {
        this.store.post(`status:${id}`, channel, root, answer);
        this.store.remember(channel, root, session.id, text, answer);
        return;
      }
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
      this.store.post(`ambiguous:${id}`, channel, root, this.voice.say('ambiguous'));
      return;
    }
    if (intent === 'watch') {
      const snapshot = await this.adapter.snapshot(session.id);
      if (snapshot.status.type !== 'active') {
        this.store.post(
          `watch:${id}`,
          channel,
          root,
          this.voice.say('idleWatch', { project: session.project }),
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
        this.voice.say('watch', { project: session.project }),
      );
      return;
    }
    if (intent === 'interrupt') {
      await this.adapter.interrupt(session.id);
      this.store.post(
        `interrupt:${id}`,
        channel,
        root,
        this.voice.say('interrupt', { project: session.project }),
      );
      return;
    }
    const input = this.voice.runtimeInput(text, this.store.conversation(channel, root, session.id));
    const delivery = await this.adapter.deliver(session.id, input, `pigeon:${id}`);
    const turnId = delivery.turnId || delivery.turn?.id;

    this.store.post(
      `delivered:${id}`,
      channel,
      root,
      this.voice.say(intent === 'status' ? 'questionDelivered' : 'delivered', {
        project: session.project,
      }),
    );
    if (turnId) await this.notifications.expectReply(session.id, turnId, channel, root, text);
  }
  private async tick() {
    if (this.busy || !this.running) return;
    this.busy = true;
    try {
      if (Date.now() >= this.nextVoiceRefresh) {
        this.nextVoiceRefresh = Date.now() + 5000;
        try {
          const fresh = readConfig().personality;
          this.voice = new Voice(fresh);
          this.config.personality = fresh;
        } catch {}
      }
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
              await this.notifications.recover(session, snapshot);
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
            this.store.post(`error:${row.id}`, row.channel, row.root, this.voice.say('uncertain'));
            failure('delivery');
          }
        }
      }
      this.approvals.expire();
      if (Date.now() >= this.nextPruneAt) {
        this.store.prune();
        this.human.prune();
        this.nextPruneAt = Date.now() + 60000;
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
