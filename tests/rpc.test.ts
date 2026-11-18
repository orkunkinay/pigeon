import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexRpc } from '../src/runtimes/codex/rpc.js';
test('real Unix WebSocket transport correlates interleaved responses and rejects pending work on disconnect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pigeon-rpc-')),
    sock = join(dir, 'c.sock');
  const server = createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) =>
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.method === 'initialize')
        ws.send(JSON.stringify({ id: m.id, result: { userAgent: 'fixture' } }));
      if (m.method === 'probe')
        setTimeout(() => ws.send(JSON.stringify({ id: m.id, result: m.params })), m.params.delay);
      if (m.method === 'disconnect') ws.close();
    }),
  );
  await new Promise<void>((r) => server.listen(sock, r));
  const rpc = new CodexRpc();
  try {
    await rpc.connect(sock);
    const [a, b] = await Promise.all([
      rpc.call('probe', { name: 'a', delay: 15 }),
      rpc.call('probe', { name: 'b', delay: 1 }),
    ]);
    assert.equal(a.name, 'a');
    assert.equal(b.name, 'b');
    await assert.rejects(rpc.call('disconnect', {}), /disconnected/);
    assert.equal(rpc.connected, false);
  } finally {
    await rpc.close();
    wss.close();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
