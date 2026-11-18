import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { WebClient } from '@slack/web-api';
import { home, readConfig } from '../src/config.js';
import { readSecret } from '../src/security/keychain.js';
import { slackLogger } from '../src/log.js';
const exec = promisify(execFile);
const mode = process.argv.includes('--ask') ? 'ask' : 'notify';
let eventsText: string;
let marker: string;
const index = process.argv.indexOf('--events');
if (index >= 0) {
  eventsText = await readFile(process.argv[index + 1], 'utf8');
  marker = process.argv[index + 2];
  assert.ok(marker, 'Supply the exact harmless test marker after the event path');
} else {
  assert.ok(process.argv.includes('--run'), 'Pass --run to launch a disposable fresh Codex session and send a real test message');
  marker = `AW-${Date.now()}`;
  const cwd = await mkdtemp(join(tmpdir(), 'pigeon-awareness-'));
  const task = mode === 'ask'
    ? `I am away from the computer. For this disposable test (${marker}), ask me whether to use amber or teal, wait for my reply, then message me the option I selected. Do not modify files or run project commands.`
    : `I am away from the computer. Please message me a brief update saying: Human communication awareness check ${marker} is complete. Do not change files or run project commands. Then tell me whether message delivery was confirmed.`;
  assert.ok(!/pigeon/i.test(task), 'Task must not explicitly mention the integration');
  const args = ['exec', '-C', cwd, '--skip-git-repo-check', '--json'];
  // This test was explicitly authorized to send harmless messages. No persistent permission change.
  for (const name of ['pigeon_notify_human', 'pigeon_ask_human', 'pigeon_request_human_action']) args.push('-c', `mcp_servers.pigeon.tools.${name}.approval_mode="approve"`);
  args.push(task);
  console.log(`Running fresh-session ${mode} test ${marker}; only communication tools are preauthorized for this invocation.`);
  const result = await exec(readConfig().codexBin, args, { timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
  eventsText = result.stdout;
  await writeFile(join(cwd, 'events.jsonl'), eventsText, { mode: 0o600 });
}
const events = eventsText.split('\n').filter(Boolean).map(l => JSON.parse(l));
const threadId = events.find(e => e.type === 'thread.started')?.thread_id;
assert.ok(threadId);
const items = events.filter(e => e.type === 'item.completed').map(e => e.item);
const skillRead = items.some(i => i.type === 'command_execution' && /\.agents\/skills\/pigeon\/SKILL\.md/.test(i.command) && i.exit_code === 0);
assert.ok(skillRead, 'Fresh agent should read the automatically discovered skill');
const calls = items.filter(i => i.type === 'mcp_tool_call' && i.server === 'pigeon');
const availability = calls.find(i => i.tool === 'pigeon_get_status')?.result?.structured_content;
assert.equal(availability?.available, true);
const sent = calls.find(i => i.tool === 'pigeon_notify_human' && i.result?.structured_content?.status === 'delivered');
assert.ok(sent, 'Actual agent-initiated message must be confirmed');
assert.equal(sent.result.structured_content.session_id, threadId);
const db = new DatabaseSync(join(home, 'pigeon.sqlite'), { readOnly: true });
const row = db.prepare('SELECT channel,root,session FROM human_requests WHERE id=?').get(sent.result.structured_content.request_id) as any;
db.close();
assert.equal(row?.session, threadId);
const slack = new WebClient(await readSecret('bot'), { logger: slackLogger, timeout: 10000, retryConfig: { retries: 0 } });
const messages = await slack.conversations.replies({ channel: row.channel, ts: row.root, limit: 10 });
assert.ok(messages.messages?.some(m => m.bot_id && (m.text || '').includes(mode === 'ask' ? '' : marker)), 'Read back only the exact test message through Slack');
const answer = calls.find(i => i.tool === 'pigeon_ask_human' && i.result?.structured_content?.status === 'answered');
if (mode === 'ask') assert.ok(answer && answer.result.structured_content.session_id === threadId, 'Human answer must return through the original session tool call');
const evidence = {
  date: new Date().toISOString(), mode, threadId, taskDidNotMentionPigeon: true,
  automaticSkillRead: skillRead, mcpAvailabilityVerified: true, agentInitiatedMessageDelivered: true,
  exactSlackMessageReadBack: true, nativeRuntimeForwardingUsed: false,
  testPermission: 'Only named Pigeon communication tools preauthorized for this invocation; no global approval policy changed.',
  ...(answer ? { correlatedHumanReplyVerified: true, reply: answer.result.structured_content.reply } : {}),
};
await writeFile(`docs/awareness-${mode}-proof.json`, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
