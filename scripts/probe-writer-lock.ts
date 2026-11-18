import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
const live = new CodexRpc();
await live.connect();
const s = (await new CodexAdapter(live).sessions()).find(
  (s) => s.cwd === '/private/tmp/pigeon-session-proof',
);
assert.ok(s);
await live.close();
const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
  stdio: ['pipe', 'pipe', 'ignore'],
});
const rl = createInterface({ input: child.stdout });
let seq = 0;
const pending = new Map<number, (v: any) => void>();
rl.on('line', (line) => {
  try {
    const m = JSON.parse(line);
    if (pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
  } catch {}
});
async function request(method: string, params: any) {
  const id = ++seq;
  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(Error('Private runtime probe timed out'));
    }, 20000);
    pending.set(id, (m) => {
      clearTimeout(timeout);
      resolve(m);
    });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}
try {
  await request('initialize', {
    clientInfo: { name: 'pigeon_lock_probe', version: '0.1.0' },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write('{"method":"initialized"}\n');
  const result = await request('thread/resume', { threadId: s.id, excludeTurns: true });
  const evidence = {
    date: new Date().toISOString(),
    threadId: s.id,
    isolatedRuntimeError: result.error || null,
    writerLockRespected: !!result.error?.message?.includes('active writer'),
  };
  console.log(JSON.stringify(evidence, null, 2));
  await writeFile('docs/writer-lock-proof.json', JSON.stringify(evidence, null, 2) + '\n');
  assert.ok(evidence.writerLockRespected);
} finally {
  rl.close();
  child.kill('SIGTERM');
}
