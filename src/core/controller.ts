import type { Store } from '../store.js';
import type { CodexAdapter, Session } from '../runtimes/codex/adapter.js';
import type { RpcMessage } from '../runtimes/codex/rpc.js';
import type { SessionRecovery } from './recovery.js';
export class MainController {
  constructor(
    private store: Store,
    private adapter: CodexAdapter,
    private recovery: SessionRecovery,
    private excluded: (id: string) => boolean,
  ) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS control_actions(id TEXT PRIMARY KEY,session TEXT,turn TEXT,kind TEXT,state TEXT,updated INTEGER)',
    );
    store.db.exec("UPDATE control_actions SET state='uncertain' WHERE state='sending'");
  }
  async send(
    row: any,
    session: Session,
    kind: 'instruction' | 'resume' | 'interrupt',
    input: string,
  ) {
    if (this.excluded(session.id)) throw Error('Discussion cannot be an execution target');
    const existing = this.store.db
      .prepare('SELECT * FROM control_actions WHERE id=?')
      .get(row.id) as any;
    if (existing) throw Error(`This action is already ${existing.state}; it was not replayed.`);
    this.store.db
      .prepare("INSERT INTO control_actions VALUES(?,?,NULL,?,'sending',?)")
      .run(row.id, session.id, kind, Date.now());
    try {
      const result =
        kind === 'interrupt'
          ? await this.adapter.interrupt(session.id).then(() => ({ mode: 'interrupted' }))
          : kind === 'resume'
            ? await this.recovery.resume(session, input, `pigeon:${row.id}`)
            : await this.adapter.deliver(session.id, input, `pigeon:${row.id}`);
      const turn = (result as any).turnId || (result as any).turn?.id || null;
      this.store.db
        .prepare("UPDATE control_actions SET state='accepted',turn=?,updated=? WHERE id=?")
        .run(turn, Date.now(), row.id);
      return result as any;
    } catch (e) {
      this.store.db
        .prepare("UPDATE control_actions SET state='uncertain',updated=? WHERE id=?")
        .run(Date.now(), row.id);
      throw e;
    }
  }
  observe(m: RpcMessage) {
    const p = m.params;
    if (!p?.threadId || !p.turn?.id) return;
    const state =
      m.method === 'turn/started'
        ? 'executing'
        : m.method === 'turn/completed'
          ? p.turn.status
          : undefined;
    if (state)
      this.store.db
        .prepare('UPDATE control_actions SET state=?,updated=? WHERE session=? AND turn=?')
        .run(state, Date.now(), p.threadId, p.turn.id);
  }
}
