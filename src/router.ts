import { normalized, statusReply } from './conversation/status.js';
import { Voice } from './conversation/voice.js';
import type { Session } from './runtimes/codex/adapter.js';
export type Intent =
  | 'status'
  | 'sessions'
  | 'interrupt'
  | 'watch'
  | 'instruction'
  | 'ambiguous'
  | 'discuss'
  | 'resume';
export type RouteCategory =
  'DISCUSS' | 'STATUS' | 'INSTRUCT' | 'INTERRUPT' | 'RESUME' | 'APPROVAL_RESPONSE' | 'CLARIFY';
export function classify(text: string): Intent {
  const t = normalized(text);
  if (/^(hey|hi|hello|hola|merhaba)$/.test(t)) return 'status';
  if (
    /^(sessions|projects|list sessions|show sessions|help|what unfinished sessions do i have)$/.test(
      t,
    )
  )
    return 'sessions';
  if (
    /^(stop|pause|interrupt|cancel)(?:\s+(?:working|the|current|task|tests?|work|execution|running|on|.*session).*)?$/.test(
      t,
    )
  )
    return 'interrupt';
  if (/^(?:continue|resume|restart|pick up where we left off)(?:\s|$)/.test(t)) return 'resume';
  if (
    /^(status|any updates|are you stuck|what are you doing|how.s it going|hey,? (what are you doing|how.s it going)|how are the tests going|what's failing|what is failing|what failed|which tests are failing|how is it going|how's it going|how are things|any news|what's happening|cómo va|como va|qué está fallando|nasıl gidiyor|durum ne)$/.test(
      t,
    )
  )
    return 'status';
  if (/^(let me know|send me an update|notify me).*(finished|complete|done)$/.test(t))
    return 'watch';
  if (/^(done|yes|no|approve|deny|ok|okay)$/.test(t)) return 'ambiguous';
  // Questions and hypotheses stay in discussion, including questions containing action words.
  if (
    /^(?:why|what|which|how|would|could|should|is|are|do you think|maybe|perhaps|suppose|if we)\b/.test(
      t,
    )
  )
    return 'discuss';
  if (
    /^(?:(?:please|okay|ok|yes)[, ]+)*(?:(?:can|could|would) you\s+)?(?:tell codex to|focus on|prioriti[sz]e|commit|run|execute|implement|fix|change|add|remove|delete|benchmark|test|build|deploy|push|use|switch to|try|work on|send me|show me)\b/.test(
      t,
    )
  )
    return 'instruction';
  if (
    /^(?:okay|ok|yes|let's|lets|go ahead|do it)[, ]*(?:let's do it|lets do it|do it|go ahead)?$/.test(
      t,
    )
  )
    return 'ambiguous';
  return 'discuss';
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
