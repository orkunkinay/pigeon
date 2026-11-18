import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlackBridge } from '../src/transports/slack/bridge.js';
import { Store } from '../src/store.js';
import { Voice } from '../src/conversation/voice.js';
/** Exercise the real routing method with a local runtime fixture; no Slack connection or model. */
function setup(output = 'Tests: 2 failed, 18 passed, 20 total') {
  const store = new Store(':memory:');
  store.bind('D', 'root', 'original');
  const delivered: string[] = [];
  const session = {
    id: 'original',
    project: 'AgentLane',
    name: 'AgentLane',
    cwd: '/app',
    status: 'active',
    updatedAt: 0,
    source: 'cli',
  };
  const adapter = {
    async sessions() {
      return [session];
    },
    async snapshot() {
      return {
        status: { type: 'active' },
        turns: [
          { items: [{ type: 'commandExecution', command: 'npm test', aggregatedOutput: output }] },
        ],
      };
    },
    async deliver(_id: string, text: string) {
      delivered.push(text);
      return { mode: 'steered', turnId: 'same-turn' };
    },
  };
  const context = {
    store,
    voice: new Voice(),
    adapter,
    approvals: {
      answer() {
        return false;
      },
    },
  };
  const route = (id: string, text: string) =>
    (SlackBridge.prototype as any).route.call(context, { id, channel: 'D', root: 'root', text });
  return { store, delivered, adapter, route };
}
test('status followed by unknown failure details carries the previous observed answer to the same worker', async () => {
  const { store, delivered, route } = setup();
  await route('status', 'Hey, how’s it going?');
  assert.equal(delivered.length, 0);
  await route('followup', "What's failing?");
  assert.equal(delivered.length, 1);
  assert.match(delivered[0], /18 passed, 2 failed/);
  assert.ok(delivered[0].startsWith("What's failing?"));
  assert.equal(
    (store.db.prepare('SELECT turn FROM awaited_replies').get() as any).turn,
    'same-turn',
  );
  store.close();
});
test('known failure names stay observational and a later instruction keeps their referent', async () => {
  const { store, delivered, route } = setup(
    'Tests: 2 failed, 18 passed, 20 total\nFAIL reconnect.browser.test.ts',
  );
  await route('failure', "What's failing?");
  assert.equal(delivered.length, 0);
  await route('instruction', 'Can you tell Codex to fix those first?');
  assert.match(delivered[0], /reconnect.browser.test.ts/);
  assert.equal(delivered.length, 1);
  store.close();
});
test('delivery is never acknowledged while acceptance is pending or after an RPC failure', async () => {
  const { store, adapter, route } = setup();
  let accept: () => void = () => {};
  adapter.deliver = async () => {
    await new Promise<void>((resolve) => {
      accept = resolve;
    });
    return { mode: 'steered', turnId: 'same-turn' };
  };
  const pending = route('delayed', 'Prioritize latency.');
  await new Promise((r) => setImmediate(r));
  assert.equal(store.outgoing().length, 0);
  accept();
  await pending;
  assert.equal(store.outgoing().length, 1);
  adapter.deliver = async () => {
    throw Error('turn precondition failed');
  };
  await assert.rejects(route('failed', 'Try another approach.'));
  assert.ok(!store.outgoing().some((r) => r.id === 'delivered:failed'));
  store.close();
});
