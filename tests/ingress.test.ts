import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { SlackIngress } from '../src/transports/slack/ingress.js';
const event = {
  team_id: 'T1',
  event_id: 'ev1',
  event: {
    type: 'message',
    channel_type: 'im',
    channel: 'D1',
    user: 'U1',
    ts: '123',
    text: 'focus on latency',
  },
};
test('actual ingress rejects unauthorized and modified Slack events before persistence', () => {
  const store = new Store(':memory:');
  const ingress = new SlackIngress(
    { teamId: 'T1', userId: 'U1', codexBin: 'codex' },
    store,
    () => true,
  );
  for (const body of [
    { ...event, team_id: 'T2' },
    { ...event, event: { ...event.event, user: 'U2' } },
    { ...event, event: { ...event.event, channel: 'C1' } },
    { ...event, event: { ...event.event, subtype: 'message_changed' } },
    { ...event, event: { ...event.event, bot_id: 'B1' } },
  ])
    ingress.receive(body);
  assert.equal(store.queued().length, 0);
  ingress.receive(event);
  ingress.receive(event);
  assert.equal(store.queued().length, 1);
  store.close();
});
test('an offline stop cannot interrupt a different future turn', () => {
  const store = new Store(':memory:');
  const ingress = new SlackIngress(
    { teamId: 'T1', userId: 'U1', codexBin: 'codex' },
    store,
    () => false,
  );
  ingress.receive({ ...event, event: { ...event.event, text: 'Pause.' } });
  assert.equal(store.queued().length, 0);
  assert.match(store.outgoing()[0].text, /couldn’t send[\s\S]*haven’t queued/);
  store.close();
});
test('pairing requires the unpredictable local phrase in the correct workspace', () => {
  const store = new Store(':memory:');
  let saved: any;
  const config = { teamId: 'T1', codexBin: 'codex' };
  const ingress = new SlackIngress(
    config,
    store,
    () => true,
    'random-secret',
    (c) => {
      saved = { ...c };
    },
  );
  ingress.receive(event);
  assert.equal(saved, undefined);
  ingress.receive({ ...event, event: { ...event.event, text: 'pair random-secret' } });
  assert.equal(saved.userId, 'U1');
  assert.equal(store.queued().length, 0);
  store.close();
});
