import { normalized, statusReply } from './conversation/status.js';
import { Voice } from './conversation/voice.js';
import type { Session } from './runtimes/codex/adapter.js';
export type Intent = 'status' | 'sessions' | 'interrupt' | 'watch' | 'instruction' | 'ambiguous';
export function classify(text: string): Intent {
  const t = normalized(text);
  if (/^(sessions|projects|list sessions|show sessions|help)$/.test(t)) return 'sessions';
  if (/^(stop|pause|stop working|stop the current task|interrupt|cancel the current task)$/.test(t))
    return 'interrupt';
  if (
    /^(status|any updates|are you stuck|what are you doing|how.s it going|hey,? (what are you doing|how.s it going)|how are the tests going|what's failing|what is failing|what failed|which tests are failing|how is it going|how's it going|how are things|any news|what's happening|cómo va|como va|qué está fallando|nasıl gidiyor|durum ne)$/.test(
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
export function statusText(session: Session, thread: any, voice = new Voice()): string {
  return statusReply(session, thread, 'status', voice)!;
}

/** A terse reply needs an actual conversational request in the mapped session. */
export function awaitsConversationalReply(thread: any): boolean {
  const message = thread.turns
    ?.at(-1)
    ?.items?.findLast((i: any) => i.type === 'agentMessage' && i.text)?.text;
  return (
    typeof message === 'string' &&
    /\?|please (?:reply|confirm|choose|select|tell me)|waiting for your (?:answer|response)|let me know (?:when|once)|when you.?re done/i.test(
      message,
    )
  );
}
