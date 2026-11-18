import type { CodexAdapter, Session } from '../runtimes/codex/adapter.js';
import type { RpcMessage } from '../runtimes/codex/rpc.js';
import type { Store } from '../store.js';
/** Bounded factual observations; never sends a user item to main. */
export class Observation {
  constructor(
    private store: Store,
    private adapter: CodexAdapter,
  ) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS observed(session TEXT PRIMARY KEY, turn TEXT, status TEXT, completed TEXT, items TEXT, updated INTEGER)',
    );
    adapter.eventSnapshot = (id, metadata) => {
      const observed = store.db.prepare('SELECT * FROM observed WHERE session=?').get(id) as any;
      return {
        ...metadata,
        observationLimited: true,
        observedAt: observed?.updated,
        turns: observed
          ? [{ id: observed.turn, status: observed.status, items: JSON.parse(observed.items) }]
          : [],
      };
    };
  }
  record(m: RpcMessage) {
    const p = m.params,
      id = p?.threadId;
    if (
      !id ||
      !['turn/started', 'turn/completed', 'item/started', 'item/completed'].includes(m.method!)
    )
      return;
    const old = this.store.db.prepare('SELECT * FROM observed WHERE session=?').get(id) as any;
    const turn = p.turn?.id || p.turnId;
    const items = old?.turn === turn ? JSON.parse(old.items || '[]') : [];
    if (p.item && ['agentMessage', 'commandExecution', 'fileChange'].includes(p.item.type)) {
      const item = {
        id: p.item.id,
        type: p.item.type,
        status: p.item.status,
        text: p.item.text?.slice(0, 4000),
        command: p.item.command?.slice(0, 600),
        aggregatedOutput: p.item.aggregatedOutput?.slice(-5000),
      };
      const at = items.findIndex((i: any) => i.id === item.id);
      if (at >= 0) items.splice(at, 1);
      items.push(item);
    }
    const complete = m.method === 'turn/completed';
    this.store.db
      .prepare('INSERT OR REPLACE INTO observed VALUES(?,?,?,?,?,?,?)')
      .run(
        id,
        turn || old?.turn || null,
        complete ? p.turn.status : 'inProgress',
        complete && p.turn.status === 'completed' ? turn : old?.completed || null,
        JSON.stringify(items.slice(-12)),
        Date.now(),
      );
  }
  async snapshot(session: Session) {
    try {
      return await this.adapter.snapshot(session.id);
    } catch {
      const { thread } = await this.adapter.rpc.call('thread/read', {
        threadId: session.id,
        includeTurns: false,
      });
      const observed = this.store.db
        .prepare('SELECT * FROM observed WHERE session=?')
        .get(session.id) as any;
      return {
        ...thread,
        observationLimited: true,
        observedAt: observed?.updated,
        turns: observed
          ? [{ id: observed.turn, status: observed.status, items: JSON.parse(observed.items) }]
          : [],
      };
    }
  }
  async context(session: Session) {
    const thread = await this.snapshot(session);
    const observed = this.store.db
      .prepare('SELECT completed FROM observed WHERE session=?')
      .get(session.id) as any;
    return {
      thread,
      boundary:
        thread.turns?.findLast((t: any) => t.status === 'completed')?.id || observed?.completed,
      facts: JSON.stringify({
        project: session.project,
        cwd: session.cwd,
        runtimeStatus: thread.status,
        observedAt: new Date().toISOString(),
        historyLimited: !!thread.observationLimited,
        turns: thread.turns?.slice(-2).map((t: any) => ({
          id: t.id,
          status: t.status,
          items: t.items
            ?.filter((i: any) =>
              ['agentMessage', 'commandExecution', 'fileChange'].includes(i.type),
            )
            .slice(-10)
            .map((i: any) => ({
              type: i.type,
              status: i.status,
              text: i.text?.slice(0, 4000),
              command: i.command?.slice(0, 600),
              output: i.aggregatedOutput?.slice(-5000),
            })),
        })),
      }).slice(0, 18000),
    };
  }
}
