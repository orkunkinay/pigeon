import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
const cwd = process.argv[2];
if (!cwd || !cwd.includes('pigeon-session-proof'))
  throw new Error('Use a disposable pigeon-session-proof directory');
const rpc = new CodexRpc();
const adapter = new CodexAdapter(rpc);
const started = performance.now();
await rpc.connect();
try {
  const sessions = (await adapter.sessions()).filter((s) => s.cwd === cwd && s.status === 'active');
  assert.equal(sessions.length, 1, 'Expected one active disposable session opened normally');
  const s = sessions[0];
  const before = await adapter.snapshot(s.id);
  const turn = before.turns.findLast((t: any) => t.status === 'inProgress');
  assert.ok(turn);
  const observed: any[] = [];
  rpc.on('notification', (m) => {
    if (m.params?.threadId === s.id) observed.push(m);
  });
  await adapter.attach(s.id);
  const delivery = await adapter.deliver(
    s.id,
    'Pigeon live attachment test: remember the second marker PIGEON-STEER-8426. After the running sleep completes, respond with both the original marker from your context and this second marker. Do not start a new task or modify any files.',
    'pigeon-proof-8426',
  );
  assert.equal(delivery.mode, 'steered');
  assert.equal(delivery.turnId, turn.id);
  const result: any = {
    date: new Date().toISOString(),
    threadId: s.id,
    originalTurnId: turn.id,
    delivery,
    discoveryAndSteerMs: Math.round(performance.now() - started),
  };
  console.log(JSON.stringify(result));
  const deadline = Date.now() + 140000;
  while (Date.now() < deadline) {
    const after = await adapter.snapshot(s.id);
    const original = after.turns.find((t: any) => t.id === turn.id);
    if (original?.status !== 'inProgress') {
      const messages = original.items
        .filter((i: any) => i.type === 'agentMessage')
        .map((i: any) => i.text)
        .join('\n');
      result.sameTurnCompleted = original.status;
      result.bothMarkers =
        messages.includes('PIGEON-ORIGINAL-7319') && messages.includes('PIGEON-STEER-8426');
      result.observedNotifications = observed.map((m) => m.method);
      console.log(JSON.stringify(result, null, 2));
      await writeFile('docs/attachment-proof.json', JSON.stringify(result, null, 2) + '\n');
      assert.ok(result.bothMarkers, 'Original worker must recall both markers');
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  assert.ok(result.bothMarkers, 'Timed out waiting for proof');
} finally {
  rpc.close();
}
