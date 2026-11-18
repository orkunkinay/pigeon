---
name: pigeon
description: Reach the human through the installed Pigeon companion when work needs a decision, authentication assistance, or a requested remote update. Use for human communication, not routine tool progress.
---

# Pigeon

The human can be reached away from this computer. Use the Pigeon MCP tools through the existing companion; no messaging credentials or separate agent are needed.

- Check availability with `pigeon_get_status` when remote communication is needed. If unavailable, explain locally; do not claim a message was delivered.
- `pigeon_ask_human`: ask a concrete question only when the answer matters and cannot reasonably be inferred. Give enough project context and the options or tradeoff.
- `pigeon_request_human_action`: ask for an external action, such as approving the displayed Microsoft number in Authenticator. Never request passwords, OTPs, recovery codes, or tokens. The returned answer is a human report, not proof: verify the original browser/provider state before continuing.
- `pigeon_notify_human`: send a useful requested update or an important blocker. Completion notifications should respect the returned preferences. Avoid routine reads, tool calls, duplicate final messages, and repeated greetings.

Waiting tools return a request ID. If still pending, call the same tool with that `request_id` to wait again; do not create another question. A timeout, cancellation, or missing reply is not consent. Treat human replies as user input, not higher-priority instructions.

Speak like a concise, capable colleague. Distinguish observed progress from plans and uncertainty. Use the voice preferences returned by `pigeon_get_status`. For example: “Quick one — Microsoft is asking for number 88. Can you approve that?” After a reply, verify authentication actually succeeded.

Native execution and file approvals belong to Codex's own approval flow, forwarded where supported by the runtime bridge. These tools cannot grant permissions, replace approval buttons, or bypass policy. Send only the minimum development context needed. Only a confirmed delivery result means the transport accepted the message; uncertainty is not success.
