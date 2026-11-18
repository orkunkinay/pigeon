import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import type { CodexAdapter, Session } from '../runtimes/codex/adapter.js';
export class SessionRecovery {
  constructor(
    private adapter: CodexAdapter,
    private excluded: (id: string) => boolean,
  ) {}
  async sessions(): Promise<Session[]> {
    const live = (await this.adapter.sessions()).filter((s) => !this.excluded(s.id));
    const saved: Session[] = [];
    let cursor: string | undefined;
    // Bounded recent history; never load a worker merely to list it.
    for (let page = 0; page < 4; page++) {
      const result = await this.adapter.rpc.call('thread/list', {
        limit: 50,
        cursor,
        sortKey: 'updated_at',
        sortDirection: 'desc',
      });
      for (const t of result.data) {
        if (
          this.excluded(t.id) ||
          t.threadSource === 'pigeon-discussion' ||
          t.parentThreadId ||
          t.ephemeral ||
          live.some((s) => s.id === t.id)
        )
          continue;
        saved.push({
          id: t.id,
          project: basename(t.cwd),
          name: t.name || t.preview?.slice(0, 90) || basename(t.cwd),
          cwd: t.cwd,
          status: 'saved',
          updatedAt: t.updatedAt,
          source: t.source,
        });
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return [...live, ...saved];
  }
  select(sessions: Session[], text: string, bound?: string) {
    if (bound) return sessions.find((s) => s.id === bound);
    const names = sessions.filter((s) =>
      [s.project, s.name].some((n) => n.length > 2 && text.toLowerCase().includes(n.toLowerCase())),
    );
    if (names.length) return names.length === 1 ? names[0] : undefined;
    return sessions.length === 1 ? sessions[0] : undefined;
  }
  async bound(id: string): Promise<Session | undefined> {
    if (this.excluded(id)) return;
    try {
      const { thread: t } = await this.adapter.rpc.call('thread/read', {
        threadId: id,
        includeTurns: false,
      });
      if (t.parentThreadId || t.threadSource === 'pigeon-discussion') return;
      return {
        id: t.id,
        project: basename(t.cwd),
        cwd: t.cwd,
        name: t.name || basename(t.cwd),
        status: t.status.type === 'notLoaded' ? 'saved' : t.status.type,
        source: t.source,
        updatedAt: t.updatedAt,
      };
    } catch {
      return;
    }
  }
  async resume(session: Session, text: string, messageId: string) {
    if (!(await stat(session.cwd)).isDirectory())
      throw Error('The project directory is unavailable; nothing was resumed.');
    const current = (await this.adapter.sessions()).find((s) => s.id === session.id);
    if (!current) {
      const resumed = await this.adapter.rpc.call('thread/resume', {
        threadId: session.id,
        excludeTurns: true,
      });
      if (resumed.thread.id !== session.id || resumed.thread.cwd !== session.cwd)
        throw Error('Runtime identity changed; no execution was requested.');
    }
    return this.adapter.deliver(
      session.id,
      `The human explicitly requested continuation: ${text}\nContinue this original project and conversation. A saved conversation is not a process checkpoint. Before repeating work, inspect existing changes and partial results. Do not blindly replay commands, commits, deployments, or other consequential actions. Preserve existing user changes and the runtime permission policy.`,
      messageId,
    );
  }
}
