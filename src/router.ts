import type { Session } from './runtimes/codex/adapter.js';
export type Intent = 'status' | 'sessions' | 'interrupt' | 'watch' | 'instruction' | 'ambiguous';
export function classify(text: string): Intent {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[?!.]+$/, '');
  if (/^(sessions|projects|list sessions|show sessions|help)$/.test(t)) return 'sessions';
  if (/^(stop|pause|stop working|stop the current task|interrupt|cancel the current task)$/.test(t))
    return 'interrupt';
  if (
    /^(status|any updates|are you stuck|what are you doing|how.s it going|hey,? (what are you doing|how.s it going)|how are the tests going)$/.test(
      t,
    )
  )
    return 'status';
  if (/^(let me know|send me an update|notify me).*(finished|complete|done)$/.test(t))
    return 'watch';
  if (/^(done|yes|no|approve|deny|ok|okay)$/.test(t)) return 'ambiguous';
  return 'instruction';
}
export function selectSession(
  sessions: Session[],
  bound?: string,
  explicit?: string,
): Session | undefined {
  if (bound) return sessions.find((s) => s.id === bound); // a stale binding must never fall through
  if (explicit) {
    const matches = sessions.filter(
      (s) =>
        s.project.toLowerCase() === explicit.toLowerCase() ||
        s.name.toLowerCase() === explicit.toLowerCase(),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }
  return sessions.length === 1 ? sessions[0] : undefined;
}
export function statusText(session: Session, thread: any): string {
  const turn = thread.turns?.at(-1);
  const items = turn?.items || [];
  const recent = items.findLast((i: any) => i.type === 'agentMessage' && i.text);
  const command = items.findLast((i: any) => i.type === 'commandExecution');
  const flags = thread.status?.activeFlags || [];
  return (
    `${session.project} — ${thread.status.type}${flags.length ? ' (' + flags.join(', ') + ')' : ''}.` +
    (recent
      ? `\nLatest agent message:\n${recent.text.slice(0, 2500)}`
      : '\nNo agent update is available yet.') +
    (command
      ? `\nLatest command (${command.status}): ${String(command.command).slice(0, 600)}`
      : '')
  );
}
