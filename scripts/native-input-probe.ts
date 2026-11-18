import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
import { writeFile } from 'node:fs/promises';
if (process.argv[2] !== '--run')
  throw Error('Pass --run and the disposable approval-test thread ID.');
const rpc = new CodexRpc();
await rpc.connect();
const adapter = new CodexAdapter(rpc);
const id = process.argv[3];
const s = await adapter.assertLoaded(id);
if (!s.cwd.endsWith('pigeon-session-proof-approval'))
  throw Error('Only the disposable test thread is allowed');
const original = await adapter.attach(id);
const evidence: any = { date: new Date().toISOString(), threadId: id, mode: 'plan', requests: [] };
rpc.on('request', (m) => {
  if (m.params.threadId === id) {
    evidence.requests.push({ id: m.id, method: m.method });
    console.log('Native request', m.method);
  }
});
rpc.on('notification', async (m) => {
  if (m.params?.threadId !== id) return;
  if (m.method === 'item/completed' && m.params.item?.type === 'agentMessage')
    console.log(m.params.item.text);
  if (m.method === 'turn/completed') {
    evidence.status = m.params.turn.status;
    evidence.turnId = m.params.turn.id;
    await writeFile('docs/input-proof.json', JSON.stringify(evidence, null, 2) + '\n');
    await rpc.close();
  }
});
await rpc.call('turn/start', {
  threadId: id,
  collaborationMode: {
    mode: 'plan',
    settings: { model: original.model, reasoning_effort: 'low', developer_instructions: null },
  },
  input: [
    {
      type: 'text',
      text: 'This is a harmless Pigeon structured-input test. Use request_user_input to ask exactly one question, with id color: should the integration test use amber or teal? Offer those two options, wait for the answer, then confirm it. Do not run commands or modify files.',
      text_elements: [],
    },
  ],
});
setTimeout(() => {
  console.log('Timed out; no automatic answer was sent.');
  void rpc.close();
}, 180000).unref();
