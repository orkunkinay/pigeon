import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { classify, selectSession } from '../src/router.js';
const a = {
  id: 'a',
  project: 'app',
  name: 'app',
  cwd: '/app',
  status: 'active',
  updatedAt: 0,
  source: 'cli',
};
test('never falls through a stale mapping or guesses between projects', () => {
  assert.equal(selectSession([a], 'old'), undefined);
  assert.equal(selectSession([a, { ...a, id: 'b' }]), undefined);
  assert.equal(selectSession([a, { ...a, id: 'b' }], undefined, 'app'), undefined);
});
test('status is observed, stop interrupts, approvals require explicit correlation', () => {
  assert.equal(classify('Hey, what are you doing?'), 'status');
  assert.equal(classify('Pause.'), 'interrupt');
  assert.equal(classify('Focus on latency instead.'), 'instruction');
  assert.equal(classify('Done'), 'ambiguous');
});
test('deduplicates incoming instructions and outgoing notifications durably', () => {
  const s = new Store(':memory:');
  assert.ok(s.enqueue('e', 'd', 't', 'hi'));
  assert.ok(!s.enqueue('e', 'd', 't', 'hi'));
  s.state('e', 'sending');
  assert.equal(s.queued().length, 0);
  s.bind('d', 't', 'a');
  assert.equal(s.binding('d', 't'), 'a');
  s.post('o', 'd', 't', 'hello');
  s.post('o', 'd', 't', 'hello');
  assert.equal(s.outgoing().length, 1);
  s.sent('o');
  assert.equal(s.outgoing().length, 0);
  s.close();
});
test('long Unicode notifications are durably chunked and deduplicated before delivery', () => {
  const s = new Store(':memory:');
  const text = '🕊️'.repeat(2000);
  s.post('long', 'D', 't', text);
  s.post('long', 'D', 't', text);
  const rows = s.outgoing();
  assert.ok(rows.length > 1);
  assert.equal(rows.map((r) => r.text).join(''), text);
  for (const row of rows) assert.ok(!row.text.includes('\ufffd'));
  s.close();
});
test('stale queued instructions expire and discard their body', () => {
  const s = new Store(':memory:');
  s.enqueue('old', 'D', 't', 'old command');
  s.db.prepare('UPDATE inbox SET created=?').run(Date.now() - 300001);
  s.expireQueued();
  assert.equal(s.queued().length, 0);
  assert.equal((s.db.prepare('SELECT text FROM inbox').get() as any).text, null);
  assert.match(s.outgoing()[0].text, /expired/);
  s.close();
});
