import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { Voice } from '../src/conversation/voice.js';
import { Discussions } from '../src/core/discussions.js';
import { classify } from '../src/router.js';
test('questions and hypothetical alternatives never classify as main instructions', () => {
  for (const question of [
    'Why are you using Playwright?',
    'Would CDP be faster?',
    'Maybe we should switch to SQLite.',
    "Why didn't you run the tests?",
    'Do you think this architecture is good?',
    'Could we try a different architecture?',
  ])
    assert.equal(classify(question), 'discuss');
  for (const instruction of [
    'Focus on latency instead.',
    'Commit the changes.',
    'Run the tests.',
    'Tell Codex to benchmark CDP too.',
  ])
    assert.equal(classify(instruction), 'instruction');
  assert.equal(classify('Stop the tests.'), 'interrupt');
  assert.equal(classify('Continue working on AgentLane.'), 'resume');
});
test('discussion reuses its branch, supplies fresh facts, hides external tools, and never calls main', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pigeon-fork-unit-'));
  const store = new Store(':memory:');
  store.bind('D', 'root', 'main');
  const calls: any[] = [];
  let manager: Discussions;
  let turn = 0;
  let facts = 'Main is running test 1';
  const rpc = {
    connected: true,
    version: '0.170.0',
    send(value: any) {
      calls.push(value);
    },
    async call(method: string, params: any) {
      calls.push({ method, params });
      if (method === 'config/read') return { config: { mcp_servers: { pigeon: {} } } };
      if (method === 'thread/fork')
        return {
          thread: { id: 'fork', status: { type: 'idle' } },
          sandbox: { type: 'readOnly', networkAccess: false },
          approvalPolicy: 'never',
        };
      if (method === 'mcpServerStatus/list') return { data: [] };
      if (method === 'thread/read') return { thread: { id: 'fork', status: { type: 'idle' } } };
      if (method === 'turn/start') {
        const id = `turn-${++turn}`;
        queueMicrotask(() => {
          manager.handle({
            method: 'item/completed',
            params: {
              threadId: 'fork',
              turnId: id,
              item: {
                type: 'agentMessage',
                text: JSON.stringify({
                  reply: 'CDP needs equivalent-condition benchmarks.',
                  proposed_instruction: 'Benchmark CDP against Playwright.',
                }),
              },
            },
          });
          manager.handle({
            method: 'turn/completed',
            params: { threadId: 'fork', turn: { id, status: 'completed' } },
          });
        });
        return { turn: { id } };
      }
      throw Error(`Unexpected method ${method}`);
    },
  };
  const observation = {
    async context() {
      return { boundary: 'completed-main-turn', facts };
    },
  };
  manager = new Discussions(store, rpc as any, observation as any, () => new Voice(), dir);
  const session = {
    id: 'main',
    project: 'AgentLane',
    cwd: '/app',
    name: 'AgentLane',
    source: 'cli',
    status: 'active',
    updatedAt: 1,
  };
  const done = async () => {
    for (let n = 0; n < 100; n++) {
      if (
        (
          store.db
            .prepare("SELECT count(*) AS n FROM discussion_jobs WHERE status='done'")
            .get() as any
        ).n === turn &&
        turn
      )
        return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error('No discussion result');
  };
  try {
    manager.enqueue(
      { id: 'first', channel: 'D', root: 'root', text: 'Would CDP be faster?' },
      session,
    );
    await manager.tick();
    await done();
    facts = 'Main is running test 2';
    manager.enqueue(
      { id: 'second', channel: 'D', root: 'root', text: 'What about that approach?' },
      session,
    );
    await manager.tick();
    for (
      let n = 0;
      n < 100 &&
      (
        store.db
          .prepare("SELECT count(*) AS n FROM discussion_jobs WHERE status='done'")
          .get() as any
      ).n < 2;
      n++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.filter((c) => c.method === 'thread/fork').length, 1);
    assert.equal(calls.filter((c) => c.method === 'turn/start').length, 2);
    assert.ok(
      calls
        .filter((c) => c.method === 'turn/start')
        .every((c) => c.params.threadId === 'fork' && c.params.sandboxPolicy.type === 'readOnly'),
    );
    assert.ok(
      !calls.some((c) => ['turn/steer', 'turn/interrupt', 'thread/resume'].includes(c.method)),
    );
    assert.match(
      calls.filter((c) => c.method === 'turn/start')[1].params.input[0].text,
      /Main is running test 2/,
    );
    assert.match(store.outgoing()[0].text, /Benchmark CDP against Playwright/);
    const config = calls.find((c) => c.method === 'thread/fork').params.config;
    assert.equal(config['mcp.enabled'], false);
    assert.equal(config['features.shell_tool'], false);
    assert.equal(config['features.hooks'], false);
    assert.equal(
      manager.handle({
        id: 'approval',
        method: 'item/commandExecution/requestApproval',
        params: { threadId: 'fork' },
      }),
      true,
    );
    assert.equal(calls.at(-1).error.code, -32000);
  } finally {
    await manager.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
