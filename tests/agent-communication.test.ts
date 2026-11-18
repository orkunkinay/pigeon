import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.js';
import { Voice } from '../src/conversation/voice.js';
import { HumanCommunication } from '../src/agent/coordinator.js';
import { serveAgentCalls, companionCall } from '../src/agent/ipc.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const signal = () => new AbortController().signal;
function fixture(store = new Store(':memory:'), quiet = false, failed = false) {
  const sent: any[] = [];
  const human = new HumanCommunication(
    store,
    () => new Voice({ proactiveness: quiet ? 'quiet' : 'important' }),
    () => ({ connected: true, paired: true, runtime: true }),
    async (id) => {
      if (!['one', 'two'].includes(id)) throw Error('Not loaded');
      return { project: id };
    },
    () => 'D-human',
    async (channel, text, id) => {
      sent.push({ channel, text, id });
      if (failed) throw Error('Network acknowledgment lost');
      return `root-${sent.length}`;
    },
  );
  return { human, store, sent };
}
test('human questions are correlated to exact sessions and do not use runtime steering', async () => {
  const { human, store, sent } = fixture();
  try {
    const one = await human.call(
      {
        name: 'pigeon_ask_human',
        session: 'one',
        arguments: { message: 'Amber or teal?', request_key: 'color', wait_seconds: 0 },
      },
      signal(),
    );
    const two = await human.call(
      {
        name: 'pigeon_ask_human',
        session: 'two',
        arguments: { message: 'Ship tomorrow?', wait_seconds: 0 },
      },
      signal(),
    );
    assert.equal(sent.length, 2);
    assert.equal(human.answer('wrong', 'root-1', 'amber'), false);
    assert.equal(human.answer('D-human', 'root-1', 'teal'), true);
    const answer = await human.call(
      { name: 'pigeon_ask_human', session: 'one', arguments: { request_id: one.request_id } },
      signal(),
    );
    assert.equal(answer.reply, 'teal');
    assert.equal(answer.status, 'answered');
    await assert.rejects(
      human.call(
        { name: 'pigeon_ask_human', session: 'two', arguments: { request_id: one.request_id } },
        signal(),
      ),
      /unavailable/,
    );
    assert.equal(
      (
        await human.call(
          {
            name: 'pigeon_ask_human',
            session: 'two',
            arguments: { request_id: two.request_id, wait_seconds: 0 },
          },
          signal(),
        )
      ).status,
      'pending',
    );
    await human.call(
      {
        name: 'pigeon_ask_human',
        session: 'one',
        arguments: { message: 'Amber or teal?', request_key: 'color', wait_seconds: 0 },
      },
      signal(),
    );
    assert.equal(sent.length, 2, 'same stable key never resends');
  } finally {
    store.close();
  }
});
test('human action completion is a report requiring verification, never an execution approval', async () => {
  const { human, store } = fixture();
  try {
    const pending = human.call(
      {
        name: 'pigeon_request_human_action',
        session: 'one',
        arguments: { message: 'Approve number 88 in Authenticator.', wait_seconds: 1 },
      },
      signal(),
    );
    await new Promise((r) => setTimeout(r, 30));
    human.answer('D-human', 'root-1', 'Done');
    const result = await pending;
    assert.equal(result.completion, 'human_reported');
    assert.equal(result.verification_required, true);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM approvals').get()?.n, 0);
  } finally {
    store.close();
  }
});
test('requests survive real reopen; expired replies and uncertain delivery never imply success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pigeon-human-'));
  let store = new Store(join(dir, 'db'));
  try {
    let f = fixture(store);
    const row = await f.human.call(
      {
        name: 'pigeon_ask_human',
        session: 'one',
        arguments: { message: 'Which?', wait_seconds: 0 },
      },
      signal(),
    );
    store.close();
    store = new Store(join(dir, 'db'));
    f = fixture(store);
    assert.equal(f.human.answer('D-human', 'root-1', 'second'), true);
    assert.equal(
      (
        await f.human.call(
          { name: 'pigeon_ask_human', session: 'one', arguments: { request_id: row.request_id } },
          signal(),
        )
      ).reply,
      'second',
    );
    store.db
      .prepare("UPDATE human_requests SET status='pending',expires=? WHERE id=?")
      .run(Date.now() - 1, row.request_id);
    assert.equal(f.human.answer('D-human', 'root-1', 'late'), true);
    assert.equal(
      store.db.prepare('SELECT response FROM human_requests WHERE id=?').get(row.request_id)
        ?.response,
      null,
    );
    const failure = fixture(store, false, true);
    const call = {
      name: 'pigeon_notify_human',
      session: 'one',
      arguments: { message: 'A blocker', request_key: 'retry' },
    };
    assert.equal((await failure.human.call(call, signal())).status, 'uncertain');
    assert.equal((await failure.human.call(call, signal())).status, 'uncertain');
    assert.equal(failure.sent.length, 1);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('MCP requires runtime attribution, rejects secrets, and honors quiet completion preferences', async () => {
  const { human, store, sent } = fixture(undefined, true);
  try {
    await assert.rejects(
      human.call({ name: 'pigeon_notify_human', arguments: { message: 'hi' } }, signal()),
      /attribution/,
    );
    await assert.rejects(
      human.call(
        { name: 'pigeon_notify_human', session: 'one', arguments: { message: 'xoxb-secret' } },
        signal(),
      ),
      /credentials/,
    );
    assert.equal(
      (
        await human.call(
          {
            name: 'pigeon_notify_human',
            session: 'one',
            arguments: { message: 'Done', reason: 'completion' },
          },
          signal(),
        )
      ).status,
      'suppressed',
    );
    assert.equal(
      (
        await human.call(
          {
            name: 'pigeon_notify_human',
            session: 'one',
            arguments: { message: 'Done', reason: 'requested' },
          },
          signal(),
        )
      ).status,
      'delivered',
    );
    assert.equal(sent.length, 1);
  } finally {
    store.close();
  }
});
test('real Unix socket has private permissions and needs no transport credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pigeon-ipc-'));
  const path = join(dir, 'ipc.sock');
  const { human, store } = fixture();
  const stop = await serveAgentCalls((call, signal) => human.call(call, signal), path);
  try {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const result = await companionCall({ name: 'pigeon_get_status' }, signal(), path);
    assert.equal(result.available, true);
    assert.equal(result.voice.voice, 'colleague');
    await assert.rejects(companionCall({ name: 'unknown' }, signal(), path), /Unknown/);
  } finally {
    await stop();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('real MCP stdio discovery forwards runtime metadata and returns correlated structured replies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pigeon-mcp-'));
  const { human, store, sent } = fixture();
  const stop = await serveAgentCalls(
    (call, signal) => human.call(call, signal),
    join(dir, 'companion.sock'),
  );
  const client = new Client({ name: 'pigeon-contract-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/cli.ts', 'mcp'],
    env: { PATH: process.env.PATH!, PIGEON_HOME: dir },
    stderr: 'ignore',
  });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 5);
    const denied = await client.callTool({
      name: 'pigeon_notify_human',
      arguments: { message: 'No attribution' },
    });
    assert.equal(denied.isError, true);
    assert.equal(sent.length, 0);
    const request = await client.callTool({
      name: 'pigeon_ask_human',
      arguments: { message: 'Amber or teal?', wait_seconds: 0 },
      _meta: { threadId: 'one', itemId: 'original-call' },
    });
    const result = request.structuredContent as any;
    assert.equal(result.status, 'pending');
    assert.equal(result.session_id, 'one');
    human.answer('D-human', 'root-1', 'teal');
    const reply = await client.callTool({
      name: 'pigeon_ask_human',
      arguments: { request_id: result.request_id },
      _meta: { threadId: 'one' },
    });
    assert.equal((reply.structuredContent as any).reply, 'teal');
  } finally {
    await client.close();
    await stop();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
