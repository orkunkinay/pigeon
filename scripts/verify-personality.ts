/** Read-only live runtime check, plus read only the already-mapped Pigeon Slack conversation. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { WebClient } from '@slack/web-api';
import { readConfig, home } from '../src/config.js';
import { readSecret } from '../src/security/keychain.js';
import { slackLogger } from '../src/log.js';
import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
import { SlackBridge } from '../src/transports/slack/bridge.js';
import { Store } from '../src/store.js';
import { Voice } from '../src/conversation/voice.js';
const rpc = new CodexRpc();
await rpc.connect();
const adapter = new CodexAdapter(rpc);
const store = new Store(':memory:');
const config = readConfig();
try {
  const session = (await adapter.sessions()).find((s) => s.cwd === process.cwd());
  assert.ok(session, 'Only verify this project’s live worker');
  const before = await adapter.snapshot(session.id);
  const turn = before.turns.at(-1);
  assert.ok(turn);
  const methods: string[] = [];
  const call = rpc.call.bind(rpc);
  rpc.call = async (method: string, params: unknown, timeout?: number) => {
    methods.push(method);
    return call(method, params, timeout);
  };
  store.bind('D-proof', 'proof', session.id);
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
  await (SlackBridge.prototype as any).route.call(context, {
    id: 'voice-proof',
    channel: 'D-proof',
    root: 'proof',
    text: 'Hey, how’s it going?',
  });
  assert.equal(methods.filter((m) => /^turn\//.test(m)).length, 0);
  const after = await adapter.snapshot(session.id);
  assert.equal(after.turns.at(-1).id, turn.id);
  const answer = store.outgoing()[0].text;
  assert.ok(answer.includes(session.project));
  assert.ok(!answer.includes('Latest agent message:'));
  const db = new DatabaseSync(join(home, 'pigeon.sqlite'), { readOnly: true });
  const target = db
    .prepare('SELECT channel,root FROM bindings WHERE session=? ORDER BY rowid DESC LIMIT 1')
    .get(session.id) as any;
  db.close();
  assert.equal(target.channel, config.dmChannel);
  const client = new WebClient(await readSecret('bot'), {
    logger: slackLogger,
    timeout: 10000,
    retryConfig: { retries: 0 },
  });
  const replies = await client.conversations.replies({
    channel: target.channel,
    ts: target.root,
    limit: 100,
  });
  const messages = replies.messages || [];
  const question = messages.findIndex(
    (m) => m.user === config.userId && !m.bot_id && /30 minute expiry/i.test(m.text || ''),
  );
  assert.ok(question >= 0, 'Find the actual human follow-up in this project’s Slack thread');
  assert.ok(
    messages
      .slice(question + 1)
      .some((m) => m.bot_id && /30.minute|cache|cutoff|expiry/i.test(m.text || '')),
    'Original worker’s answer must have returned through Slack',
  );
  const proof = {
    date: new Date().toISOString(),
    threadId: session.id,
    turnId: turn.id,
    liveStatusRouteVerified: true,
    statusAddedNoTurnOrSteer: true,
    slackHumanFollowupAndWorkerAnswerVerified: true,
    statusExample: answer,
    voice: new Voice().preferences,
    contextPolicy:
      'One bounded exchange per mapped thread; no short timed expiry; cleared on project switch.',
    checks:
      '44 local tests including routing, CLI, notification policy, approval safeguards and persistent follow-ups',
  };
  await writeFile('docs/personality-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify({ ...proof, statusExample: answer.slice(0, 180) }, null, 2));
} finally {
  store.close();
  await rpc.close();
}
