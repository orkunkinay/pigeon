import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { home } from '../src/config.js';
import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
const rpc = new CodexRpc();
await rpc.connect();
const a = new CodexAdapter(rpc);
const s = (await a.sessions()).find((s) => s.cwd === '/private/tmp/pigeon-session-proof');
assert.ok(s);
const before = await a.snapshot(s.id);
const active = before.turns.findLast((t: any) => t.status === 'inProgress');
assert.ok(active, 'Start the harmless sleep task in Slack first');
const started = Date.now();
const db = new DatabaseSync(join(home, 'pigeon.sqlite'), { readOnly: true });
const evidence: any = {
  date: new Date().toISOString(),
  threadId: s.id,
  turnId: active.id,
  statusDidNotAddTurn: false,
  steeringSameTurn: false,
  interrupted: false,
};
console.log('Observing active turn', active.id);
try {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const current = await a.snapshot(s.id);
    const turn = current.turns.find((t: any) => t.id === active.id);
    const status = db
      .prepare("SELECT id FROM outbox WHERE id LIKE 'status:%' AND created>=? AND sent=1")
      .get(started);
    if (status && !evidence.statusDidNotAddTurn) {
      assert.equal(current.turns.length, before.turns.length);
      assert.equal(
        turn.items.filter((i: any) => i.type === 'userMessage').length,
        active.items.filter((i: any) => i.type === 'userMessage').length,
      );
      evidence.statusDidNotAddTurn = true;
      console.log('Status did not add a turn or a user item');
    }
    if (
      JSON.stringify(turn.items.filter((i: any) => i.type === 'userMessage')).includes(
        'PIGEON-STEER-LATENCY-3860',
      )
    )
      evidence.steeringSameTurn = true;
    if (turn.status !== 'inProgress') {
      evidence.finalStatus = turn.status;
      evidence.interrupted = turn.status === 'interrupted';
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await writeFile('docs/live-slack-proof.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  assert.ok(evidence.statusDidNotAddTurn && evidence.steeringSameTurn && evidence.interrupted);
} finally {
  db.close();
  await rpc.close();
}
