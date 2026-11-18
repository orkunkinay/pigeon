import type { Session } from '../runtimes/codex/adapter.js';
import { Voice } from './voice.js';
export function normalized(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[¿¡]/, '')
    .replace(/[?!.]+$/, '')
    .replace(/^(?:hey|hi|hello)(?: pigeon)?[,!]?\s+/, '');
}
export function statusTopic(text: string): 'overview' | 'failures' {
  return /(?:fail|failing|fallando|fallaron|başarısız|hatalı)/i.test(text)
    ? 'failures'
    : 'overview';
}
interface TestResult {
  passed?: number;
  failed?: number;
  total?: number;
  failures: string[];
}
/** Recognize output from test commands, never infer failed counts from unfinished work. */
export function observedTests(thread: any): TestResult | undefined {
  const items = thread.turns?.at(-1)?.items || [];
  const command = items.findLast(
    (i: any) =>
      i.type === 'commandExecution' &&
      /\b(?:pytest|vitest|jest|npm (?:run )?test|pnpm (?:run )?test|yarn test|cargo test|go test|--test)\b/.test(
        i.command || '',
      ) &&
      typeof i.aggregatedOutput === 'string',
  );
  if (!command) return;
  const output = command.aggregatedOutput.replace(/\x1b\[[0-9;]*m/g, '');
  const line =
    output
      .split('\n')
      .findLast((l: string) =>
        /^\s*(?:Tests\s*:|Tests\s+\d|\d+ (?:passed|failed)[,\s]|=+.*\d+ (?:passed|failed))/.test(l),
      ) || '';
  const pass = output.match(/^# pass (\d+)\s*$/m)?.[1] || line.match(/(\d+) passed\b/)?.[1];
  const fail = output.match(/^# fail (\d+)\s*$/m)?.[1] || line.match(/(\d+) failed\b/)?.[1];
  const total = output.match(/^# tests (\d+)\s*$/m)?.[1] || line.match(/(\d+) total\b/)?.[1];
  if (pass === undefined && fail === undefined) return;
  const failures = output
    .split('\n')
    .filter((l: string) => /^\s*(?:FAIL\s+\S|FAILED\s+\S|not ok \d+ - |[×✗]\s+\S)/.test(l))
    .map((l: string) => l.trim())
    .slice(0, 8);
  return {
    passed: pass === undefined ? undefined : Number(pass),
    failed: fail === undefined ? undefined : Number(fail),
    total: total === undefined ? undefined : Number(total),
    failures,
  };
}
export function statusReply(
  session: Session,
  thread: any,
  text: string,
  voice = new Voice(),
  now = Date.now(),
): string | undefined {
  const tests = observedTests(thread);
  if (statusTopic(text) === 'failures') {
    if (tests?.failures.length)
      return voice.say('failures', {
        project: session.project,
        failures: voice.excerpt(tests.failures.join('\n')),
      });
    if (tests?.failed === 0)
      return voice.say('tests', {
        project: session.project,
        result: voice.say('failed', { count: 0 }),
      });
    return; // Ask the original worker, rather than inventing failure names or causes.
  }
  const flags = thread.status?.activeFlags || [];
  const heading = voice.say(
    flags.includes('waitingOnApproval')
      ? 'waitingApproval'
      : flags.includes('waitingOnUserInput')
        ? 'waitingInput'
        : thread.status?.type === 'systemError'
          ? 'systemError'
          : thread.status?.type === 'active'
            ? 'active'
            : 'idle',
    { project: session.project },
  );
  if (tests) {
    const result = [
      tests.passed === undefined ? '' : voice.say('passed', { count: tests.passed }),
      tests.failed === undefined ? '' : voice.say('failed', { count: tests.failed }),
    ]
      .filter(Boolean)
      .join(', ');
    return heading + '\n' + voice.say('tests', { project: session.project, result });
  }
  const items = thread.turns?.at(-1)?.items || [];
  const recent = items.findLast((i: any) => i.type === 'agentMessage' && i.text);
  const ageMinutes =
    typeof thread.updatedAt === 'number' ? Math.floor((now - thread.updatedAt * 1000) / 60000) : 0;
  const age = ageMinutes >= 2 ? voice.say('ago', { minutes: ageMinutes }) : '';
  let reply =
    heading +
    '\n' +
    (recent
      ? voice.say('lastUpdate', { text: voice.excerpt(recent.text), age })
      : voice.say('noUpdate'));
  if (voice.preferences.verbosity === 'detailed') {
    const command = items.findLast((i: any) => i.type === 'commandExecution');
    if (command)
      reply +=
        '\n' +
        voice.say('latestCommand', {
          status: command.status,
          command: String(command.command).slice(0, 600),
        });
  }
  return reply;
}
