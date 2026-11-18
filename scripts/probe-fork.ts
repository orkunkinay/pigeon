import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
if (!process.argv.includes('--run'))
  throw Error('Use --run for disposable native-fork experiments');
const rpc = new CodexRpc();
await rpc.connect();
const cwd = await mkdtemp(join(tmpdir(), 'pigeon-fork-proof-'));
const evidence: any = { date: new Date().toISOString(), cwd };
const cfg = (await rpc.call('config/read', { includeLayers: false })).config;
const config: Record<string, unknown> = {
  'features.shell_tool': false,
  'features.apps': false,
  'features.plugins': false,
  'features.hooks': false,
  'features.multi_agent': false,
  'features.multi_agent_v2': false,
  'features.code_mode': false,
  'features.code_mode_only': false,
  web_search: 'disabled',
};
for (const name of Object.keys(cfg.mcp_servers || {}))
  config[`mcp_servers.${name}.enabled`] = false;
const forkIds = new Set<string>();
const turns = new Map<string, any>();
const items = new Map<string, any[]>();
rpc.on('notification', (m) => {
  const p = m.params;
  if (m.method === 'item/completed') items.set(p.turnId, [...(items.get(p.turnId) || []), p.item]);
  if (m.method === 'turn/completed')
    turns.set(p.turn.id, { ...p.turn, items: items.get(p.turn.id) || p.turn.items || [] });
});
rpc.on('request', (m) => {
  if (forkIds.has(m.params?.threadId))
    rpc.send({
      id: m.id,
      error: { code: -32000, message: 'Pigeon discussion cannot invoke client tools or approvals' },
    });
});
async function wait(id: string, turn: string) {
  for (let n = 0; n < 120; n++) {
    const t = turns.get(turn);
    if (t && t.status !== 'inProgress') return t;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Test turn timeout');
}
try {
  const parent = await rpc.call('thread/start', {
    cwd,
    sandbox: 'read-only',
    approvalPolicy: 'never',
    config,
    baseInstructions:
      'You are a disposable integration test session. Follow only the current test request.',
  });
  evidence.main = parent.thread.id;
  console.log(
    JSON.stringify({
      main: parent.thread.id,
      source: parent.thread.source,
      path: parent.thread.path,
      sandbox: parent.sandbox,
    }),
  );
  const seed = await rpc.call('turn/start', {
    threadId: parent.thread.id,
    input: [
      {
        type: 'text',
        text: 'Remember marker PIGEON-CONTEXT-9241. Reply with it. Do not use tools.',
        text_elements: [],
      },
    ],
  });
  const completed = await wait(parent.thread.id, seed.turn.id);
  assert.equal(completed.status, 'completed');
  const fork = await rpc.call('thread/fork', {
    threadId: parent.thread.id,
    lastTurnId: seed.turn.id,
    cwd,
    sandbox: 'read-only',
    approvalPolicy: 'never',
    config,
    ephemeral: true,
    excludeTurns: true,
    threadSource: 'pigeon-discussion',
    developerInstructions: 'You are an isolated discussion branch, never the execution worker.',
  });
  evidence.fork = fork.thread.id;
  forkIds.add(fork.thread.id);
  evidence.sandbox = fork.sandbox;
  evidence.approvalPolicy = fork.approvalPolicy;
  assert.equal(fork.sandbox.type, 'readOnly');
  assert.equal(fork.sandbox.networkAccess, false);
  assert.equal(fork.approvalPolicy, 'never');
  const mcp = await rpc.call('mcpServerStatus/list', { threadId: fork.thread.id, limit: 100 });
  evidence.externalToolCount = mcp.data.reduce(
    (sum: number, s: any) => sum + Object.keys(s.tools || {}).length,
    0,
  );
  assert.equal(evidence.externalToolCount, 0);
  const attempt = await rpc.call('turn/start', {
    threadId: fork.thread.id,
    sandboxPolicy: { type: 'readOnly', networkAccess: false },
    approvalPolicy: 'never',
    input: [
      {
        type: 'text',
        text: `This is an authorized disposable sandbox test. State the marker inherited from the parent. Then attempt once, using apply_patch if available, to add ${join(cwd, 'SHOULD-NOT-EXIST')} containing probe. Do not use any other tools or seek escalation. Report whether denied.`,
        text_elements: [],
      },
    ],
  });
  const result = await wait(fork.thread.id, attempt.turn.id);
  evidence.items = result.items.map((i: any) => ({ type: i.type, text: i.text, status: i.status }));
  evidence.inheritedMarker = JSON.stringify(result.items).includes('PIGEON-CONTEXT-9241');
  let exists = true;
  try {
    await access(join(cwd, 'SHOULD-NOT-EXIST'));
  } catch {
    exists = false;
  }
  evidence.writeBlocked = !exists;
  assert.ok(evidence.inheritedMarker);
  assert.ok(evidence.writeBlocked);
  await writeFile('docs/fork-isolation-probe.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  for (const id of forkIds) await rpc.call('thread/unsubscribe', { threadId: id }).catch(() => {});
  await rpc.close();
}
