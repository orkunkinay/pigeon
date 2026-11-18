import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRecovery } from '../src/core/recovery.js';
import { MainController } from '../src/core/controller.js';
import { Store } from '../src/store.js';
test('saved conversation discovery never resumes work; explicit recovery preserves exact identity', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pigeon-recovery-'));
  const store = new Store(':memory:');
  const calls: any[] = [];
  const session = {
    id: 'original',
    project: 'AgentLane',
    name: 'latency tests',
    cwd,
    status: 'saved',
    source: 'cli',
    updatedAt: 1,
  };
  let loaded = false;
  const adapter = {
    async sessions() {
      return loaded ? [session] : [];
    },
    rpc: {
      async call(method: string, params: any) {
        calls.push({ method, params });
        if (method === 'thread/list')
          return {
            data: [
              { ...session, threadSource: null },
              { ...session, id: 'fork', threadSource: 'pigeon-discussion' },
            ],
          };
        if (method === 'thread/resume') {
          loaded = true;
          return { thread: { id: session.id, cwd } };
        }
        throw Error('Unexpected method');
      },
    },
    async deliver(id: string, input: string) {
      calls.push({ method: 'deliver', id, input });
      return { mode: 'started', turn: { id: 'continuation' } };
    },
  };
  const recovery = new SessionRecovery(adapter as any, (id) => id === 'fork');
  const controller = new MainController(store, adapter as any, recovery, (id) => id === 'fork');
  try {
    assert.deepEqual(
      (await recovery.sessions()).map((s) => s.id),
      ['original'],
    );
    assert.ok(!calls.some((c) => c.method === 'thread/resume'));
    assert.equal(
      recovery.select([session, { ...session, id: 'other' }], 'Continue AgentLane'),
      undefined,
    );
    assert.equal(recovery.select([session], 'Continue AgentLane')?.id, session.id);
    await controller.send({ id: 'explicit-user-message' }, session, 'resume', 'Continue AgentLane');
    assert.deepEqual(calls.find((c) => c.method === 'thread/resume').params, {
      threadId: 'original',
      excludeTurns: true,
    });
    const delivered = calls.find((c) => c.method === 'deliver');
    assert.equal(delivered.id, 'original');
    assert.match(delivered.input, /not a process checkpoint|not a process checkpoint/i);
    assert.match(delivered.input, /Do not blindly replay/);
    await assert.rejects(
      controller.send({ id: 'explicit-user-message' }, session, 'resume', 'Continue'),
      /not replayed/,
    );
    await assert.rejects(
      controller.send({ id: 'wrong' }, { ...session, id: 'fork' }, 'instruction', 'commit'),
      /cannot be an execution target/,
    );
    assert.equal(calls.filter((c) => c.method === 'deliver').length, 1);
  } finally {
    store.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
