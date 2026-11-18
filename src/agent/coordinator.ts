import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';
import type { Voice } from '../conversation/voice.js';
import type { AgentCall } from './contracts.js';
import { tools } from './contracts.js';

type RequestRow = {
  id: string;
  session: string;
  tool: string;
  status: string;
  root: string | null;
  channel: string;
  response: string | null;
  expires: number;
  created: number;
};
export class HumanCommunication {
  private creating = Promise.resolve();
  constructor(
    private store: Store,
    private voice: () => Voice,
    private availability: () => { connected: boolean; paired: boolean; runtime: boolean },
    private session: (id: string) => Promise<{ project: string }>,
    private target: () => string | undefined,
    private post: (channel: string, text: string, id: string) => Promise<string>,
  ) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS human_requests(
      id TEXT PRIMARY KEY, session TEXT NOT NULL, tool TEXT NOT NULL, request_key TEXT NOT NULL,
      status TEXT NOT NULL, channel TEXT NOT NULL, root TEXT, response TEXT, expires INTEGER,
      created INTEGER, UNIQUE(session,request_key));
      UPDATE human_requests SET status='uncertain' WHERE status='creating';`);
  }
  private row(id: string) {
    return this.store.db.prepare('SELECT * FROM human_requests WHERE id=?').get(id) as
      RequestRow | undefined;
  }
  private result(row: RequestRow) {
    return {
      request_id: row.id,
      status: row.status,
      session_id: row.session,
      ...(row.response
        ? {
            reply: row.response,
            ...(row.tool === 'pigeon_request_human_action'
              ? { completion: 'human_reported', verification_required: true }
              : {}),
          }
        : {}),
      ...(row.status === 'pending'
        ? {
            next: 'Call the same tool with request_id to keep waiting. Do not resend the question.',
          }
        : {}),
    };
  }
  prune() {
    this.store.db
      .prepare(
        "UPDATE human_requests SET status='expired',response=NULL WHERE status='pending' AND expires<=?",
      )
      .run(Date.now());
    this.store.db
      .prepare("DELETE FROM human_requests WHERE status!='pending' AND expires<?")
      .run(Date.now() - 86400000);
  }
  /** Called only after Slack identity checks and only for the exact request thread. */
  answer(channel: string, root: string, text: string) {
    this.prune();
    const row = this.store.db
      .prepare('SELECT * FROM human_requests WHERE channel=? AND root=?')
      .get(channel, root) as RequestRow | undefined;
    if (!row) return false;
    if (row.status === 'answered' || row.tool === 'pigeon_notify_human') return false;
    if (row.status !== 'pending') {
      this.store.post(
        `human-closed:${row.id}`,
        channel,
        root,
        'That request is no longer waiting. No response was sent to the agent.',
      );
      return true;
    }
    // Replies are user input. They cannot resolve native approval objects or grant permissions.
    this.store.db
      .prepare(
        "UPDATE human_requests SET status='answered',response=? WHERE id=? AND status='pending'",
      )
      .run(text.slice(0, 3000), row.id);
    this.store.post(`human-reply:${row.id}`, channel, root, this.voice().say('answerSent'));
    return true;
  }
  async call(call: AgentCall, signal: AbortSignal) {
    if (!call || !tools.some((t) => t.name === call.name)) throw Error('Unknown Pigeon tool');
    const a = call.arguments || {};
    const allowed = [
      'message',
      'request_id',
      'request_key',
      'wait_seconds',
      'expires_in_seconds',
      'reason',
    ];
    if (Object.keys(a).some((k) => !allowed.includes(k)))
      throw Error('Unknown communication option');
    this.prune();
    const state = this.availability();
    if (call.name === 'pigeon_get_status')
      return {
        available: state.connected && state.paired,
        companion: true,
        human_paired: state.paired,
        transport_connected: state.connected,
        runtime_connected: state.runtime,
        session_attribution: !!call.session,
        voice: this.voice().preferences,
        tools: tools.map((t) => t.name),
      };
    if (typeof call.session !== 'string' || !call.session)
      throw Error(
        'Runtime thread attribution is missing. This client must supply _meta.threadId; no session is guessed.',
      );
    const notify = call.name === 'pigeon_notify_human';
    const reason = a.reason ?? 'important';
    if (!['requested', 'important', 'completion'].includes(String(reason)))
      throw Error('Invalid notification reason');
    if (notify && reason === 'completion' && this.voice().preferences.proactiveness === 'quiet')
      return { status: 'suppressed', reason: 'quiet notification preference' };
    const wait = a.wait_seconds ?? 40;
    const expiry = a.expires_in_seconds ?? 86400;
    if (
      !Number.isInteger(wait) ||
      Number(wait) < 0 ||
      Number(wait) > 45 ||
      !Number.isInteger(expiry) ||
      Number(expiry) < 60 ||
      Number(expiry) > 86400
    )
      throw Error('Invalid wait or expiration');
    let row: RequestRow | undefined;
    if (a.request_id !== undefined) {
      if (typeof a.request_id !== 'string') throw Error('Invalid request_id');
      row = this.row(a.request_id);
      if (!row || row.session !== call.session || row.tool !== call.name)
        throw Error('Request is unavailable in this session');
    } else {
      if (!state.connected || !state.paired)
        throw Error('Human communication is offline; no message was sent');
      if (typeof a.message !== 'string' || !a.message.trim() || a.message.length > 3000)
        throw Error('A nonempty message of at most 3000 characters is required');
      if (
        a.request_key !== undefined &&
        (typeof a.request_key !== 'string' || !a.request_key || a.request_key.length > 120)
      )
        throw Error('Invalid request_key');
      // Reject common credential material before it can reach transport or persistence.
      if (/xox[baprs]-|-----BEGIN .*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}/.test(a.message))
        throw Error('Do not send credentials through Pigeon');
      const project = await this.session(call.session);
      const key = String(a.request_key || call.callKey || randomUUID());
      // Serialize root creation, not waiting. A lost Slack acknowledgment is never automatically retried.
      const create = this.creating.then(async () => {
        const existing = this.store.db
          .prepare('SELECT * FROM human_requests WHERE session=? AND request_key=?')
          .get(call.session!, key) as RequestRow | undefined;
        if (existing) {
          if (existing.tool !== call.name)
            throw Error('request_key already belongs to another tool');
          return existing;
        }
        const channel = this.target();
        if (!channel) throw Error('Human is not paired');
        const id = randomUUID();
        this.store.db
          .prepare("INSERT INTO human_requests VALUES(?,?,?,?,'creating',?,NULL,NULL,?,?)")
          .run(
            id,
            call.session!,
            call.name,
            key,
            channel,
            Date.now() + Number(expiry) * 1000,
            Date.now(),
          );
        try {
          const text = `${project.project} · Codex\n${a.message}${notify ? '' : '\n\nReply in this thread.'}`;
          const root = await this.post(channel, text, id);
          this.store.db
            .prepare('UPDATE human_requests SET status=?,root=? WHERE id=?')
            .run(notify ? 'delivered' : 'pending', root, id);
          if (!notify) this.store.bind(channel, root, call.session!);
        } catch {
          this.store.db.prepare("UPDATE human_requests SET status='uncertain' WHERE id=?").run(id);
        }
        return this.row(id)!;
      });
      this.creating = create.then(
        () => {},
        () => {},
      );
      row = await create;
    }
    const until = Date.now() + Number(wait) * 1000;
    while (!notify && row.status === 'pending' && Date.now() < until && !signal.aborted) {
      await new Promise((r) => setTimeout(r, 200));
      this.prune();
      row = this.row(row.id)!;
    }
    return this.result(row);
  }
}
