import { basename } from 'node:path';
import { CodexRpc } from './rpc.js';
export interface Session {
  id: string;
  name: string;
  project: string;
  cwd: string;
  status: string;
  updatedAt: number;
  source: unknown;
}
export class CodexAdapter {
  constructor(public rpc: CodexRpc) {}
  async sessions(): Promise<Session[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.rpc.call('thread/loaded/list', { limit: 100, cursor });
      ids.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    const sessions: Session[] = [];
    for (const id of ids) {
      try {
        const { thread: t } = await this.rpc.call('thread/read', {
          threadId: id,
          includeTurns: false,
        });
        if (typeof t.source === 'object') continue; // exclude internal subagents
        sessions.push({
          id: t.id,
          name: t.name || basename(t.cwd),
          project: basename(t.cwd),
          cwd: t.cwd,
          status: t.status.type,
          updatedAt: t.updatedAt,
          source: t.source,
        });
      } catch {
        /* a session can unload during discovery */
      }
    }
    return sessions;
  }
  async assertLoaded(id: string) {
    const session = (await this.sessions()).find((s) => s.id === id);
    if (!session)
      throw new Error(
        'This session is no longer loaded in the connected runtime. Open it in Codex and select it again.',
      );
    return session;
  }
  async attach(id: string) {
    await this.assertLoaded(id);
    // No overrides: joining a live thread must preserve its permissions and instructions.
    return this.rpc.call('thread/resume', { threadId: id });
  }
  async snapshot(id: string) {
    await this.assertLoaded(id);
    return (await this.rpc.call('thread/read', { threadId: id, includeTurns: true })).thread;
  }
  async deliver(id: string, text: string, messageId: string) {
    await this.attach(id);
    const thread = await this.snapshot(id);
    const active = thread.turns?.findLast((t: any) => t.status === 'inProgress');
    const input = [{ type: 'text', text, text_elements: [] }];
    // A steer race fails explicitly; never retry it as a new turn.
    if (active)
      return {
        mode: 'steered',
        ...(await this.rpc.call('turn/steer', {
          threadId: id,
          expectedTurnId: active.id,
          input,
          clientUserMessageId: messageId,
        })),
      };
    if (thread.status.type === 'active')
      throw new Error(
        'The runtime is busy but its active turn is unavailable. Message was not sent.',
      );
    return {
      mode: 'started',
      ...(await this.rpc.call('turn/start', {
        threadId: id,
        input,
        clientUserMessageId: messageId,
      })),
    };
  }
  async interrupt(id: string) {
    const t = await this.snapshot(id);
    const active = t.turns?.findLast((t: any) => t.status === 'inProgress');
    if (!active) throw new Error('No active turn to interrupt.');
    await this.rpc.call('turn/interrupt', { threadId: id, turnId: active.id });
  }
}
