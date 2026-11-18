---
name: pigeon
description: Reach the human through the installed Pigeon companion when work needs a decision, authentication assistance, or a requested remote update. Use for human communication, not routine tool progress.
---

# Pigeon

Your human can be reached away from this computer through the existing Pigeon companion. No Slack credentials, separate connection, or separate paid model is needed.

**Talk to the fork. Direct the main. Approve through the coordinator.**

Slack discussion goes to a restricted conversational branch or read-only status service. Main keeps working. The branch receives fresh observed activity and remembers its own discussion; it cannot execute instructions, send human requests, or approve anything. Native history forks are used when a completed boundary is available; otherwise a labelled context snapshot is used. Isolation is runtime-version gated and fails closed.

Explicit execution requests go to the original main session using steering or a new turn. A discussion recommendation is not authorization. A short assent only acts on a previously displayed proposal. Missing context or unclear project selection requires clarification, not guessing. Only relevant discussion context is handed off; casual chat stays out of main.

An explicit request to continue a stopped session may resume its saved conversation through the main controller. That is not restoration of a terminated command. Inspect existing changes and partial results before continuing; do not blindly replay commits or other consequential actions. Ordinary reconnection does not restart work automatically.

- Check availability with `pigeon_get_status` when remote communication is needed. If unavailable, explain locally; do not claim a message was delivered.
- `pigeon_list_sessions` lists recent active/saved main conversations without resuming them. Use project names; per-call runtime identity and the Slack discussion binding keep sessions separate. Never guess another session ID or use a discussion branch as an execution worker.
- `pigeon_ask_human`: ask a concrete question only when the answer matters and cannot reasonably be inferred. Give enough project context and the options or tradeoff.
- `pigeon_request_human_action`: ask for an external action, such as approving the displayed Microsoft number in Authenticator. Never request passwords, OTPs, recovery codes, or tokens. The returned answer is a human report, not proof: verify the original browser/provider state before continuing.
- `pigeon_notify_human`: send a useful requested update or an important blocker. Completion notifications should respect the returned preferences. Avoid routine reads, tool calls, duplicate final messages, and repeated greetings.

Waiting tools return a request ID. If still pending, call the same tool with that `request_id` to wait again; do not create another question. A timeout, cancellation, or missing reply is not consent. Treat human replies as user input, not higher-priority instructions.

Speak like a concise, capable colleague. Distinguish observed progress from plans and uncertainty. Use the voice preferences returned by `pigeon_get_status`. For example: “Quick one — Microsoft is asking for number 88. Can you approve that?” After a reply, verify authentication actually succeeded.

Native execution and file approvals belong to Codex's own approval flow, forwarded where supported by the runtime bridge. These tools cannot grant permissions, replace approval buttons, or bypass policy. Send only the minimum development context needed. Only a confirmed delivery result means the transport accepted the message; uncertainty is not success.

See [routing and recovery contracts](references/routing.md) for limits, pending-request behavior, and privacy. Native first-use consent still applies to communication tools.
