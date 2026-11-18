import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export class Store {
 readonly db: DatabaseSync;
 constructor(path: string) {
  if(path!==':memory:') mkdirSync(dirname(path), { recursive:true, mode:0o700 });
  this.db = new DatabaseSync(path); if(path!==':memory:') chmodSync(path,0o600);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS bindings(channel TEXT, root TEXT, session TEXT NOT NULL, PRIMARY KEY(channel,root));
   CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, channel TEXT, root TEXT, text TEXT, status TEXT, created INTEGER);
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, channel TEXT, root TEXT, text TEXT, blocks TEXT, sent INTEGER DEFAULT 0, created INTEGER);
   CREATE TABLE IF NOT EXISTS approvals(token TEXT PRIMARY KEY, generation TEXT, rpc_id TEXT, session TEXT, channel TEXT, root TEXT, method TEXT, params TEXT, status TEXT, expires INTEGER);
   CREATE TABLE IF NOT EXISTS watches(session TEXT PRIMARY KEY, channel TEXT, root TEXT);
  `);
  // Never replay a potentially delivered instruction after a crash.
  this.db.exec("UPDATE inbox SET status='uncertain' WHERE status='sending'");
  this.prune();
 }
 bind(channel:string,root:string,session:string) { this.db.prepare('INSERT OR REPLACE INTO bindings VALUES(?,?,?)').run(channel,root,session); }
 binding(channel:string,root:string): string|undefined { return (this.db.prepare('SELECT session FROM bindings WHERE channel=? AND root=?').get(channel,root) as any)?.session; }
 targets(session:string): {channel:string;root:string}[] { return this.db.prepare('SELECT channel,root FROM bindings WHERE session=? ORDER BY rowid DESC LIMIT 1').all(session) as any; }
 enqueue(id:string,channel:string,root:string,text:string) { return this.db.prepare("INSERT OR IGNORE INTO inbox VALUES(?,?,?,?,'queued',?)").run(id,channel,root,text,Date.now()).changes>0; }
 queued(): any[] { return this.db.prepare("SELECT * FROM inbox WHERE status='queued' ORDER BY created,rowid LIMIT 25").all(); }
 state(id:string,status:string) { this.db.prepare('UPDATE inbox SET status=?,text=CASE WHEN ? IN (\'done\',\'uncertain\') THEN NULL ELSE text END WHERE id=?').run(status,status,id); }
 post(id:string,channel:string,root:string,text:string,blocks?:unknown[]) { this.db.prepare('INSERT OR IGNORE INTO outbox(id,channel,root,text,blocks,created) VALUES(?,?,?,?,?,?)').run(id,channel,root,text,blocks?JSON.stringify(blocks):null,Date.now()); }
 outgoing(): any[] { return this.db.prepare('SELECT * FROM outbox WHERE sent=0 ORDER BY created,rowid LIMIT 25').all(); }
 sent(id:string) { this.db.prepare('UPDATE outbox SET sent=1,text=NULL,blocks=NULL WHERE id=?').run(id); }
 invalidateApprovals() { this.db.exec("UPDATE approvals SET status='disconnected',params=NULL WHERE status='pending'"); }
 prune() {
  const cutoff=Date.now()-7*86400000;
  this.db.prepare('DELETE FROM inbox WHERE created<?').run(cutoff);
  this.db.prepare('DELETE FROM outbox WHERE created<?').run(cutoff);
  this.db.prepare('DELETE FROM approvals WHERE expires<?').run(Date.now()-86400000);
 }
 close(){this.db.close();}
}
