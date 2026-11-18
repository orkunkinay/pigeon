import { Store } from '../store.js';
import type { RpcMessage } from '../runtimes/codex/rpc.js';
import { Voice } from './voice.js';
/** Attention-worthy commentary only; rhetorical questions and routine tool activity stay quiet. */
export function needsAttention(text: string): boolean {
  return /\b(?:can|could|would) you\b|\b(?:need|waiting for) your (?:approval|answer|input|decision|help)\b|\bplease (?:approve|confirm|select|choose|log in|sign in)\b|\b(?:authenticator|authentication (?:is )?(?:blocked|required)|blocked (?:by|on)|cannot continue|can't continue)\b|(?:necesito tu|necesita tu|por favor (?:confirma|elige)|bloquead[oa])|(?:onayını|yanıtını|yardımına|giriş yapman|devam edemiyorum)/iu.test(
    text,
  );
}
export class Notifications {
  constructor(
    private store: Store,
    private voice: () => Voice,
    private project: (id: string) => Promise<string>,
    private now = () => Date.now(),
  ) {}
  async expectReply(
    session: string,
    turn: string,
    channel: string,
    root: string,
    question: string,
  ) {
    this.store.expectReply(session, turn, channel, root, question);
    const outcome = this.store.db
      .prepare('SELECT * FROM turn_outcomes WHERE session=? AND turn=?')
      .get(session, turn) as any;
    if (outcome)
      await this.handle({
        method: 'turn/completed',
        params: {
          threadId: session,
          turn: {
            id: turn,
            status: outcome.status,
            error: outcome.error ? { message: outcome.error } : null,
          },
        },
      });
  }
  async handle(m: RpcMessage) {
    const p = m.params;
    if (!p?.threadId) return;
    const target = this.store.targets(p.threadId)[0];
    if (!target) return;
    const turn = p.turnId || p.turn?.id;
    if (!turn) return;
    const voice = this.voice();
    const pending = this.store.db
      .prepare('SELECT * FROM awaited_replies WHERE session=? AND turn=?')
      .get(p.threadId, turn) as any;
    if (m.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text) {
      const item = p.item;
      this.store.db
        .prepare('INSERT OR REPLACE INTO turn_messages VALUES(?,?,?,?)')
        .run(p.threadId, turn, item.id, item.text.slice(0, 12000));
      // Final text is released only after native turn completion, unless this is an explicit conversational reply.
      const attention = needsAttention(item.text);
      const last =
        (
          this.store.db
            .prepare('SELECT updated FROM progress_notifications WHERE session=?')
            .get(p.threadId) as any
        )?.updated ?? -Infinity;
      const progress =
        voice.preferences.proactiveness === 'updates' &&
        item.phase !== 'final_answer' &&
        this.now() - last >= 60000;
      const directReply = pending && !pending.answered && item.phase !== 'final_answer';
      if (directReply || attention || progress) {
        const project = await this.project(p.threadId);
        this.store.post(
          `agent:${p.threadId}:${item.id}`,
          target.channel,
          target.root,
          voice.agent(project, item.text, !!directReply || attention),
        );
        if (directReply) {
          this.store.remember(
            pending.channel,
            pending.root,
            p.threadId,
            pending.question,
            item.text,
          );
          this.store.db
            .prepare('UPDATE awaited_replies SET answered=1 WHERE session=? AND turn=?')
            .run(p.threadId, turn);
        }
        if (progress && !directReply && !attention)
          this.store.db
            .prepare('INSERT OR REPLACE INTO progress_notifications VALUES(?,?)')
            .run(p.threadId, this.now());
      }
    }
    if (m.method !== 'turn/completed') return;
    this.store.db
      .prepare('INSERT OR REPLACE INTO turn_outcomes VALUES(?,?,?,?,?)')
      .run(
        p.threadId,
        turn,
        p.turn.status,
        p.turn.error?.message?.slice(0, 2500) || null,
        Date.now(),
      );
    const watch = this.store.db
      .prepare('SELECT * FROM watches WHERE session=? AND turn=?')
      .get(p.threadId, turn) as any;
    const last = this.store.db
      .prepare('SELECT * FROM turn_messages WHERE session=? AND turn=?')
      .get(p.threadId, turn) as any;
    const status = p.turn.status;
    if (!['completed', 'failed', 'interrupted'].includes(status)) return;
    const project = await this.project(p.threadId);
    if (status === 'failed' || status === 'interrupted') {
      // A failed or interrupted turn is never presented as completed work.
      this.store.post(
        `completed:${p.threadId}:${turn}`,
        target.channel,
        target.root,
        voice.say(status === 'failed' ? 'failedTurn' : 'interrupted', { project }) +
          (p.turn.error?.message ? '\n' + voice.excerpt(p.turn.error.message) : ''),
      );
    } else if (pending || watch || voice.preferences.proactiveness !== 'quiet') {
      if (last) {
        this.store.post(
          `agent:${p.threadId}:${last.item}`,
          target.channel,
          target.root,
          voice.agent(project, last.text, !!pending || !!watch),
        );
        if (pending)
          this.store.remember(
            pending.channel,
            pending.root,
            p.threadId,
            pending.question,
            last.text,
          );
      }
      if (watch || !last)
        this.store.post(
          `completed:${p.threadId}:${turn}`,
          target.channel,
          target.root,
          voice.say('completed', { project }),
        );
    }
    if (watch)
      this.store.db.prepare('DELETE FROM watches WHERE session=? AND turn=?').run(p.threadId, turn);
    this.store.db
      .prepare('DELETE FROM awaited_replies WHERE session=? AND turn=?')
      .run(p.threadId, turn);
  }
  async recover(session: string, snapshot: any) {
    const turn = snapshot.turns?.at(-1);
    if (!turn) return;
    const last = turn.items?.findLast((i: any) => i.type === 'agentMessage' && i.text);
    if (last) {
      // Reconnect does not replay routine progress; it restores only a final result or a genuine request.
      this.store.db
        .prepare('INSERT OR REPLACE INTO turn_messages VALUES(?,?,?,?)')
        .run(session, turn.id, last.id, last.text.slice(0, 12000));
      if (turn.status === 'inProgress' && needsAttention(last.text))
        await this.handle({
          method: 'item/completed',
          params: { threadId: session, turnId: turn.id, item: last },
        });
    }
    if (turn.status !== 'inProgress')
      await this.handle({ method: 'turn/completed', params: { threadId: session, turn } });
  }
}
