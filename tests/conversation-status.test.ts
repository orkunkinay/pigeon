import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusReply, observedTests } from '../src/conversation/status.js';
import { Voice } from '../src/conversation/voice.js';
import { classify } from '../src/router.js';
import { Store } from '../src/store.js';
const session = {
  id: 'original',
  project: 'AgentLane',
  name: 'AgentLane',
  cwd: '/app',
  status: 'active',
  updatedAt: 0,
  source: 'cli',
};
const thread = (output: string, command = 'npm test') => ({
  status: { type: 'active' },
  turns: [{ items: [{ type: 'commandExecution', command, aggregatedOutput: output }] }],
});
test('casual questions and follow-ups are recognized without special syntax', () => {
  for (const t of [
    "Hey, how's it going?",
    'Hi Pigeon, how are things?',
    "What's failing?",
    'Nasıl gidiyor?',
    '¿Cómo va?',
  ])
    assert.equal(classify(t), 'status', t);
});
test('test status uses observed output and does not invent the remaining failures', () => {
  const t = thread('Tests: 2 failed, 18 passed, 20 total\nFAIL browser/reconnect.test.ts');
  assert.deepEqual(observedTests(t), {
    passed: 18,
    failed: 2,
    total: 20,
    failures: ['FAIL browser/reconnect.test.ts'],
  });
  const reply = statusReply(session, t, "How's it going?")!;
  assert.match(reply, /18 passed, 2 failed/);
  assert.ok(!reply.includes('fixed'));
  assert.match(statusReply(session, t, "What's failing?")!, /browser\/reconnect/);
  assert.equal(observedTests(thread('18 passed, 2 failed', 'echo fixture')), undefined);
  const partial = observedTests(thread('# tests 20\n# pass 18'));
  assert.equal(partial?.failed, undefined);
});
test('unknown failure names are delegated; a failed command is not a completed task', () => {
  assert.equal(
    statusReply(session, thread('Tests: 2 failed, 18 passed'), "What's failing?"),
    undefined,
  );
  const t = {
    status: { type: 'active' },
    turns: [{ items: [{ type: 'agentMessage', text: 'I plan to commit after the tests.' }] }],
  };
  assert.match(statusReply(session, t, 'status')!, /Last update from Codex/);
  assert.ok(!statusReply(session, t, 'status')!.includes('Changes are committed'));
});
test('follow-up context stays scoped to its session and expires', () => {
  const store = new Store(':memory:');
  store.remember('D', 'root', 'a', 'Status?', '18 of 20 tests passing.');
  assert.ok(store.conversation('D', 'root', 'a'));
  assert.equal(store.conversation('D', 'root', 'b'), undefined);
  store.db.prepare('UPDATE dialogue SET updated=?').run(Date.now() - 1800001);
  assert.equal(store.conversation('D', 'root', 'a'), undefined);
  store.close();
});
test('detailed status exposes observed command details while brief status stays short', () => {
  const t = thread('no result yet');
  assert.ok(!statusReply(session, t, 'status')!.includes('Last command'));
  assert.match(
    statusReply(session, t, 'status', new Voice({ verbosity: 'detailed' }))!,
    /npm test/,
  );
});
