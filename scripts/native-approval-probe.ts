/** Explicit, disposable runtime test. Uses existing Codex authentication/usage. */
import { CodexRpc } from '../src/runtimes/codex/rpc.js';
import { mkdir, writeFile } from 'node:fs/promises';
if (process.argv[2] !== '--run') throw Error('Pass --run to start one harmless Codex test turn.');
await mkdir('/tmp/pigeon-session-proof-approval', { recursive: true });
const rpc = new CodexRpc();
await rpc.connect();
const { thread } = await rpc.call('thread/start', {
  cwd: '/tmp/pigeon-session-proof-approval',
  approvalPolicy: 'on-request',
  sandbox: 'read-only',
});
const evidence: any = { threadId: thread.id, date: new Date().toISOString(), requests: [] };
console.log('Disposable approval test thread:', thread.id);
rpc.on('request', (m) => {
  if (m.params?.threadId === thread.id) {
    evidence.requests.push({ method: m.method, id: m.id, turnId: m.params.turnId });
    console.log('Native request:', m.method);
  }
});
rpc.on('notification', async (m) => {
  if (m.params?.threadId !== thread.id) return;
  if (m.method === 'item/completed' && m.params.item?.type === 'agentMessage')
    console.log('Agent:', m.params.item.text);
  if (m.method === 'turn/completed') {
    evidence.turnId = m.params.turn.id;
    evidence.status = m.params.turn.status;
    await writeFile('docs/approval-proof.json', JSON.stringify(evidence, null, 2) + '\n');
    await rpc.close();
  }
});
await rpc.call('turn/start', {
  threadId: thread.id,
  input: [
    {
      type: 'text',
      text: 'This is a disposable Pigeon approval integration test. First say that you are ready and run sleep 25 so the human can connect Slack. Then request a ONE-TIME native command approval by using exec_command with sandbox_permissions require_escalated, justification "May I run the harmless Pigeon approval test?", and cmd "printf PIGEON-NATIVE-APPROVAL-1648". Do not request a persistent prefix rule. Do not modify files, read credentials, or perform any other operations. After approval report the exact command output.',
      text_elements: [],
    },
  ],
});
setTimeout(() => {
  console.log('Test timeout; no automatic approval was sent.');
  void rpc.close();
}, 5 * 60000).unref();
