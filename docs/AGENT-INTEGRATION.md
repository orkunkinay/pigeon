# Pigeon inside your agent

Pigeon adds a portable [Agent Skills entry point](../src/agent/skill/SKILL.md) and four MCP tools. They use the installed companion, its existing Slack connection, and its paired human. There is no second model or messaging service.

`pigeon setup` installs these automatically. Existing paired installations can run `pigeon setup` again without copying credentials, or `pigeon install-agent` to repair only agent integration. Setup checks runtime skill discovery and the MCP tool catalog. `pigeon doctor` reports those checks and whether the registration is enabled.

## Discovery and consent

Current Codex discovers user skills in `~/.agents/skills`. Pigeon installs `pigeon/SKILL.md` there. Global guidance goes in the active `AGENTS.override.md`, if nonempty, otherwise `AGENTS.md` under `CODEX_HOME` (default `~/.codex`). A short delimited paragraph tells the agent when the skill applies. All other instructions remain intact. Newly launched sessions read global guidance; an already-running session may need reopening to load a new MCP registration.

Skill invocation remains conditional on the task. The paragraph improves awareness; it does not force a tool call for every task or guarantee a model will make the right communication decision.

**Codex's own tool consent still applies.** First use of a sending tool may require local approval. Pigeon does not change global approval policy or grant itself permission to execute commands. A noninteractive session with approval policy `never` can reject a send. Authorize the communication tools in Codex before leaving the computer when that policy requires consent. Pigeon reports rejection rather than claiming delivery. Native execution/file approvals continue through the existing runtime bridge; MCP first-use consent is a separate local permission, not a human-action reply.

The [live awareness proof](awareness-notify-proof.json) launched a fresh Codex session with a task that did not mention Pigeon. Codex independently read the skill, checked availability, called the send tool, and delivered a message verified through Slack. This disposable test preauthorized only the named communication tool for that invocation; no persistent approval policy changed. Native runtime event forwarding was not involved. The [question round-trip proof](awareness-ask-proof.json) separately verified an authenticated Slack test reply returned to the original caller and was reflected in its follow-up message. The harmless reply was submitted through the authorized account using browser automation, not invented as a runtime event.

## Tools

| Tool | Behavior |
| --- | --- |
| `pigeon_get_status` | Availability, pairing, runtime connection, voice preferences, and tool names. No message is sent. |
| `pigeon_notify_human` | Sends an update without waiting for a human response. `delivered` means Slack acknowledged it, not that the human read it. |
| `pigeon_ask_human` | Sends a concrete question in its own reply thread and waits for a correlated answer. |
| `pigeon_request_human_action` | Requests an external action and waits for a human report. The agent must verify the actual provider/browser state afterward. |

New sending calls take `message` and optionally a stable `request_key` for deduplication. Notification `reason` is `important`, `requested`, or `completion`; quiet mode suppresses unrequested completion messages. Requests to collect credentials are outside the contract. A displayed number-matching challenge is allowed; passwords, OTPs, recovery codes, and tokens are not.

Waiting calls long-poll for up to 40 seconds by default (configurable `wait_seconds: 0..45`). A `pending` result includes `request_id`; call the **same tool** with that ID to wait again without resending. An interrupted MCP call does not discard an already-delivered question. Pending state survives companion restarts. New questions expire after 24 hours by default; `expires_in_seconds: 60..86400` can shorten that deadline. An expired request never means consent. This pending-request deadline is separate from the last-exchange cache, which has no short timed cutoff.

Replies are accepted only from the paired human in the exact request thread. Multiple questions get separate threads. Action results include `completion: human_reported` and `verification_required: true`. They do not approve native execution or modify runtime permissions.

## Local architecture and runtime attribution

```text
Original agent → MCP stdio process → private Unix socket → existing companion → human
Original waiting tool call ← correlated result ← persisted human reply ← paired human
```

The MCP process has no Slack tokens or Slack connection. The socket is `~/.pigeon/companion.sock`, mode `0600`, inside Pigeon's private directory; there is no TCP control listener. Processes under the same operating-system account are trusted. Socket permissions do not isolate mutually hostile processes sharing that account.

Codex currently supplies `_meta.threadId` on each MCP call, including shared MCP processes. Sending fails if attribution is absent; Pigeon never guesses from the working directory or the number of active sessions. For future clients, an adapter must provide equivalent per-call attribution. The tool schemas contain no Slack channel, workspace, or user identifiers.

MCP communication also works from private Codex runtimes such as `codex exec`: answers return through that original process's waiting call. Pigeon may use persisted metadata to label a project, but never resumes history to pretend it has live control. Independent Slack steering and native event forwarding still require a session loaded in the shared daemon. Replies after a private session has ended cannot restart it through Pigeon.

Lost delivery acknowledgments become `uncertain` and are not automatically resent. Stable keys and request IDs deduplicate local retries. Slack delivery itself is not an exactly-once guarantee. Human reply text is bounded to 3,000 characters; answered/expired request records are pruned one day after their original expiry. Original question text is not stored in this request table, although Slack retains the sent message under its own retention policy.

## Reversible installation

Codex's supported `mcp add/get/remove` commands manage registration. A stable, locally owned launcher points to Pigeon's immutable installed runtime, so routine upgrades do not rewrite customized MCP options. Repeated setup does not duplicate the skill or global instruction block. Existing unrelated `pigeon` skills or registrations cause a conflict instead of being overwritten.

`pigeon uninstall` removes only owned, unchanged integration files and the exact instruction insertion. Modified skill files or MCP configuration are preserved and reported for review. User configuration, other skills, and unrelated instructions remain intact.

## Verification

```bash
npm test
npx tsx scripts/verify-awareness.ts --run
npx tsx scripts/verify-awareness.ts --run --ask
```

The live tests send harmless messages to the paired human and use existing Codex authentication and usage limits. The question test needs an actual reply in its request thread. Each test launches a disposable fresh session and preauthorizes only Pigeon's communication tools for that invocation. Local tests separately exercise real MCP stdio, Unix-socket permissions, session correlation, durable responses, expiry, uncertainty, native-approval separation, and reversible registration using an isolated Codex home. The standard skill validator also passes.

Discovery conventions were verified against current [official skills documentation](https://learn.chatgpt.com/docs/build-skills?product=codex), [global instruction documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md), installed Codex CLI help, and [upstream per-call MCP attribution](https://github.com/openai/codex/blob/main/codex-rs/core/src/mcp_tool_call.rs). MCP uses the [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
