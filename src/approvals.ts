import { randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { CodexRpc, type RpcMessage } from './runtimes/codex/rpc.js';
export const supportedRequests = new Set([
  'item/commandExecution/requestApproval',
  'item/tool/requestUserInput',
]);
export class Approvals {
  generation = randomUUID();
  constructor(
    private store: Store,
    private rpc: CodexRpc,
  ) {}
  disconnect() {
    this.store.invalidateApprovals();
    this.generation = randomUUID();
  }
  receive(m: RpcMessage) {
    const p = m.params;
    if (!p?.threadId || m.id === undefined || !supportedRequests.has(m.method!)) return;
    const target = this.store.targets(p.threadId)[0];
    if (!target) return;
    if (
      this.store.db
        .prepare("SELECT token FROM approvals WHERE generation=? AND rpc_id=? AND status='pending'")
        .get(this.generation, JSON.stringify(m.id))
    )
      return;
    const token = randomUUID(),
      expires = Date.now() + 10 * 60 * 1000;
    this.store.db
      .prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(
        token,
        this.generation,
        JSON.stringify(m.id),
        p.threadId,
        target.channel,
        target.root,
        m.method!,
        JSON.stringify(p),
        'pending',
        expires,
      );
    const command = m.method === 'item/commandExecution/requestApproval';
    // Refuse to offer truncated, additional-permission, or unknown approval variants remotely.
    let actionable =
      command &&
      !!p.command &&
      p.command.length < 2200 &&
      !p.additionalPermissions &&
      (!p.availableDecisions || p.availableDecisions.includes('accept'));
    const text = command
      ? `Codex requests a one-time command approval.\nProject directory: ${p.cwd || 'unknown'}\nAction: ${p.command || 'not supplied'}\nReason: ${p.reason || 'not supplied'}`
      : `Codex needs your input:\n${(p.questions || []).map((q: any) => `${q.header}: ${q.question}\n${(q.options || []).map((o: any) => o.label + ': ' + o.description).join('\n')}`).join('\n\n')}\nReply in this thread. This response will be delivered to the original request.`;
    actionable = actionable && text.length <= 2900;
    const blocks: any[] = [
      { type: 'section', text: { type: 'plain_text', text: text.slice(0, 2900) } },
    ];
    if (command)
      blocks.push({
        type: 'actions',
        elements: [
          ...(actionable
            ? [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Approve once' },
                  action_id: 'approval_accept',
                  value: token,
                },
              ]
            : []),
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Deny' },
            action_id: 'approval_decline',
            value: token,
          },
        ],
      });
    if (command && !actionable)
      blocks.push({
        type: 'section',
        text: {
          type: 'plain_text',
          text: 'Review the full action in Codex. This request cannot be approved remotely.',
        },
      });
    this.store.post(`approval:${token}`, target.channel, target.root, text, blocks);
  }
  resolved(id: unknown) {
    this.store.db
      .prepare(
        "UPDATE approvals SET status='resolved',params=NULL WHERE generation=? AND rpc_id=? AND status='pending'",
      )
      .run(this.generation, JSON.stringify(id));
  }
  resolve(token: string, channel: string, root: string, decision: 'accept' | 'decline') {
    const row = this.store.db
      .prepare(
        "SELECT * FROM approvals WHERE token=? AND channel=? AND root=? AND generation=? AND status='pending' AND expires>?",
      )
      .get(token, channel, root, this.generation, Date.now()) as any;
    if (!row || !this.rpc.connected)
      throw new Error('This request expired, disconnected, or was already resolved. Check Codex.');
    const p = JSON.parse(row.params);
    if (row.method !== 'item/commandExecution/requestApproval')
      throw new Error('Wrong request type');
    if (
      decision === 'accept' &&
      (!p.command ||
        p.command.length >= 2200 ||
        `Codex requests a one-time command approval.\nProject directory: ${p.cwd || 'unknown'}\nAction: ${p.command || 'not supplied'}\nReason: ${p.reason || 'not supplied'}`
          .length > 2900 ||
        p.additionalPermissions ||
        (p.availableDecisions && !p.availableDecisions.includes('accept')))
    )
      throw new Error('Review this request in Codex.');
    // Claim before send: a crash gives uncertainty rather than replayable authority.
    this.store.db
      .prepare(
        "UPDATE approvals SET status='responded',params=NULL WHERE token=? AND status='pending'",
      )
      .run(token);
    this.rpc.respond(JSON.parse(row.rpc_id), { decision });
  }
  answer(channel: string, root: string, text: string): boolean {
    const rows = this.store.db
      .prepare(
        "SELECT * FROM approvals WHERE channel=? AND root=? AND generation=? AND status='pending' AND method='item/tool/requestUserInput' AND expires>?",
      )
      .all(channel, root, this.generation, Date.now()) as any[];
    if (!rows.length) return false;
    if (rows.length !== 1) throw new Error('Several questions are pending. Answer them in Codex.');
    const row = rows[0],
      p = JSON.parse(row.params);
    if (p.questions.length !== 1)
      throw new Error('This request has multiple questions. Answer them in Codex.');
    this.store.db
      .prepare("UPDATE approvals SET status='responded',params=NULL WHERE token=?")
      .run(row.token);
    this.rpc.respond(JSON.parse(row.rpc_id), {
      answers: { [p.questions[0].id]: { answers: [text] } },
    });
    return true;
  }
  expire() {
    this.store.db
      .prepare(
        "UPDATE approvals SET status='expired',params=NULL WHERE status='pending' AND expires<?",
      )
      .run(Date.now());
  }
}
