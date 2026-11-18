import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS bindings(channel TEXT, root TEXT, session TEXT NOT NULL, PRIMARY KEY(channel,root));
   CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, channel TEXT, root TEXT, text TEXT, status TEXT, created INTEGER);
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, channel TEXT, root TEXT, text TEXT, blocks TEXT, sent INTEGER DEFAULT 0, created INTEGER);
   CREATE TABLE IF NOT EXISTS approvals(token TEXT PRIMARY KEY, generation TEXT, rpc_id TEXT, session TEXT, channel TEXT, root TEXT, method TEXT, params TEXT, status TEXT, expires INTEGER);
   CREATE TABLE IF NOT EXISTS watches(session TEXT PRIMARY KEY, channel TEXT, root TEXT, turn TEXT);
  `);
    if (
      !(this.db.prepare('PRAGMA table_info(watches)').all() as any[]).some((c) => c.name === 'turn')
    ) {
      this.db.exec('ALTER TABLE watches ADD COLUMN turn TEXT; DELETE FROM watches;');
    }
    // Never replay a potentially delivered instruction after a crash.
    const interrupted = this.db
      .prepare("SELECT id,channel,root FROM inbox WHERE status='sending'")
      .all() as any[];
    this.db.exec("UPDATE inbox SET status='uncertain',text=NULL WHERE status='sending'");
    for (const row of interrupted)
      this.post(
        `recovery:${row.id}`,
        row.channel,
        row.root,
        'Pigeon restarted during delivery. The instruction may have reached Codex; it will not be replayed. Check status before retrying.',
      );
    this.prune();
  }
  bind(channel: string, root: string, session: string) {
    this.db.prepare('INSERT OR REPLACE INTO bindings VALUES(?,?,?)').run(channel, root, session);
  }
  binding(channel: string, root: string): string | undefined {
    return (
      this.db
        .prepare('SELECT session FROM bindings WHERE channel=? AND root=?')
        .get(channel, root) as any
    )?.session;
  }
  targets(session: string): { channel: string; root: string }[] {
    return this.db
      .prepare('SELECT channel,root FROM bindings WHERE session=? ORDER BY rowid DESC LIMIT 1')
      .all(session) as any;
  }
  enqueue(id: string, channel: string, root: string, text: string) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO inbox VALUES(?,?,?,?,'queued',?)")
        .run(id, channel, root, text, Date.now()).changes > 0
    );
  }
  queued(): any[] {
    return this.db
      .prepare("SELECT * FROM inbox WHERE status='queued' ORDER BY created,rowid LIMIT 25")
      .all();
  }
  state(id: string, status: string) {
    this.db
      .prepare(
        "UPDATE inbox SET status=?,text=CASE WHEN ? IN ('done','uncertain','expired') THEN NULL ELSE text END WHERE id=?",
      )
      .run(status, status, id);
  }
  post(id: string, channel: string, root: string, text: string, blocks?: unknown[]) {
    const chunks = blocks ? [text.slice(0, 3500)] : text.match(/[\s\S]{1,3500}/gu) || [''];
    for (let n = 0; n < chunks.length; n++)
      this.db
        .prepare(
          'INSERT OR IGNORE INTO outbox(id,channel,root,text,blocks,created) VALUES(?,?,?,?,?,?)',
        )
        .run(
          n === 0 ? id : `${id}:part:${n}`,
          channel,
          root,
          chunks[n],
          n === 0 && blocks ? JSON.stringify(blocks) : null,
          Date.now(),
        );
  }
  expireQueued() {
    const rows = this.db
      .prepare("SELECT id,channel,root FROM inbox WHERE status='queued' AND created<?")
      .all(Date.now() - 300000) as any[];
    for (const row of rows) {
      this.state(row.id, 'expired');
      this.post(
        `expired:${row.id}`,
        row.channel,
        row.root,
        'This queued message expired after five minutes and was not delivered. Send it again if it is still relevant.',
      );
    }
  }

  outgoing(): any[] {
    return this.db
      .prepare('SELECT * FROM outbox WHERE sent=0 ORDER BY created,rowid LIMIT 25')
      .all();
  }
  sent(id: string) {
    this.db.prepare('UPDATE outbox SET sent=1,text=NULL,blocks=NULL WHERE id=?').run(id);
  }
  invalidateApprovals() {
    this.db.exec("UPDATE approvals SET status='disconnected',params=NULL WHERE status='pending'");
  }
  prune() {
    const cutoff = Date.now() - 7 * 86400000;
    this.db.prepare('DELETE FROM inbox WHERE created<?').run(cutoff);
    this.db.prepare('DELETE FROM outbox WHERE created<?').run(cutoff);
    this.db.prepare('DELETE FROM approvals WHERE expires<?').run(Date.now() - 86400000);
  }
  close() {
    this.db.close();
  }
}
