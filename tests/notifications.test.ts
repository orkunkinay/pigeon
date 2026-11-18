import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Voice } from '../src/conversation/voice.js';
import { Notifications } from '../src/conversation/notifications.js';
function setup(proactiveness: 'quiet' | 'important' | 'updates' = 'important') {
  const s = new Store(':memory:');
  s.bind('D', 'root', 'a');
  let now = 100000;
  const n = new Notifications(
    s,
    () => new Voice({ proactiveness }),
    async () => 'AgentLane',
    () => now,
  );
  return {
    s,
    n,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
const message = (id: string, text: string) => ({
  method: 'item/completed',
  params: { threadId: 'a', turnId: 'turn', item: { type: 'agentMessage', id, text } },
});
const complete = (status = 'completed', id = 'turn') => ({
  method: 'turn/completed',
  params: { threadId: 'a', turn: { id, status } },
});
test('routine commentary and tool events stay silent; completion preserves exact attribution', async () => {
  const { s, n } = setup();
  await n.handle(message('1', 'Reading the files now.'));
  await n.handle({
    method: 'item/completed',
    params: {
      threadId: 'a',
      turnId: 'turn',
      item: { type: 'commandExecution', id: 'cmd', command: 'cat file' },
    },
  });
  assert.equal(s.outgoing().length, 0);
  await n.handle(message('2', 'Changes are committed.'));
  assert.equal(s.outgoing().length, 0);
  await n.handle(complete());
  assert.equal(s.outgoing().length, 1);
  assert.match(s.outgoing()[0].text, /Codex on AgentLane:\nChanges are committed/);
  s.close();
});
test('quiet mode still delivers requested replies, human assistance and serious errors', async () => {
  const { s, n } = setup('quiet');
  s.expectReply('a', 'turn', 'D', 'root', 'How are the tests?');
  await n.handle(message('answer', '18 passed, 2 failed.'));
  assert.equal(s.outgoing().length, 1);
  assert.match(s.conversation('D', 'root', 'a')!.answer, /18 passed/);
  await n.handle(message('question', 'Microsoft Authenticator needs your approval: select 88.'));
  assert.equal(s.outgoing().length, 2);
  await n.handle(complete('failed'));
  assert.match(s.outgoing().at(-1).text, /couldn’t finish/);
  s.close();
});
test('an interrupted turn never turns a plan into a completed action', async () => {
  const { s, n } = setup();
  await n.handle(message('plan', 'I will commit after testing.'));
  await n.handle(complete('interrupted'));
  assert.equal(s.outgoing().length, 1);
  assert.match(s.outgoing()[0].text, /stopped this turn/);
  assert.ok(!s.outgoing()[0].text.includes('commit'));
  s.close();
});
test('updates are coalesced, not a notification per tool or agent sentence', async () => {
  const { s, n, advance } = setup('updates');
  await n.handle(message('1', 'Checking tests.'));
  await n.handle(message('2', 'Reading another file.'));
  assert.equal(s.outgoing().length, 1);
  advance(60000);
  await n.handle(message('3', 'Benchmark still running.'));
  assert.equal(s.outgoing().length, 2);
  s.close();
});
test('completion watches match the exact turn even in quiet mode', async () => {
  const { s, n } = setup('quiet');
  s.db.prepare('INSERT INTO watches VALUES(?,?,?,?)').run('a', 'D', 'root', 'watched');
  await n.handle(complete('completed', 'other'));
  assert.equal(s.outgoing().length, 0);
  await n.handle(complete('completed', 'watched'));
  assert.equal(s.outgoing().length, 1);
  s.close();
});
test('reconnect does not replay a long commentary history or duplicate a delivered final reply', async () => {
  const { s, n } = setup();
  const snapshot = {
    turns: [
      {
        id: 'turn',
        status: 'completed',
        items: [
          { id: 'old', type: 'agentMessage', text: 'Reading files.' },
          { id: 'final', type: 'agentMessage', text: 'Finished the requested check.' },
        ],
      },
    ],
  };
  await n.recover('a', snapshot);
  await n.recover('a', snapshot);
  assert.equal(s.outgoing().length, 1);
  assert.ok(!s.outgoing()[0].text.includes('Reading files'));
  s.close();
});
