# Security model

Pigeon is a local control bridge. A paired Slack identity can send instructions to
Codex with the permissions that Codex already has. Treat that Slack account, its
logged-in devices, the bot token, and your macOS user account as trusted control
surfaces. This preview has not undergone an independent security audit.

- Only direct messages from the explicitly paired user and workspace are accepted.
  Pairing requires a random phrase displayed locally; knowing the bot’s name is insufficient.
- The daemon connects to Codex’s existing Unix socket. It does not expose a TCP
  control service, scrape session memory, inject keys, edit rollouts, or break locks.
- Credentials are macOS generic-password Keychain items `dev.pigeon.slack.bot` and
  `dev.pigeon.slack.app`, account `pigeon`. Token values are passed to Keychain on
  stdin rather than process arguments. No plaintext fallback is provided.
- Setup binds only to `127.0.0.1`, on a random port and random path, checks Host and
  Origin, requires a hidden random CSRF value, disallows framing, and expires.
  It collects only the bot and app tokens, never your Slack password or Codex auth.
- Native command approvals bind a random one-use control to connection generation,
  exact RPC request ID, thread, Slack channel/thread, and expiry. Restart/disconnect,
  native resolution, or expiry invalidates old controls. The runtime arbitrates races
  with a simultaneous local approval. A Slack acknowledgment is not proof that the
  runtime still accepted a stale request.
- Additional permission bundles, file changes, truncated/absent commands, and unknown
  request types cannot be approved remotely. Existing Codex approval rules still apply.
- Incoming instructions are stored before the Slack envelope is acknowledged. A crash
  during delivery marks the instruction uncertain and never automatically retries it.
  Notifications are at-least-once: a crash after Slack accepted a post but before the
  local commit can produce a duplicate notification. Exactly-once distributed posting
  is not claimed.
- Pending payloads are stored locally in SQLite inside a mode-0700 directory. Main
  database mode is 0600; WAL files are protected by the directory. Completed inbox/outbox message
  bodies are cleared. The last bounded question/reply for each mapped Slack thread is
  retained locally for follow-ups until the mapping changes or Pigeon is uninstalled.
  It is timestamped and never treated as fresh evidence. A bounded delivery-race buffer
  keeps at most 100 agent replies; old completed-turn records are pruned after 24 hours. Retention is bounded, but SQLite pages and OS backups can retain
  deleted bytes; this is not forensic secure erasure. Slack keeps its own copies.

Only bind projects whose output you intend to transmit to Slack. Raw agent messages
can contain source code or other private content. Pigeon does not promise automatic
secret detection or redact arbitrary model output. Status replies are observed excerpts,
not independently verified explanations. Default logs contain event categories, not
message bodies, tokens, command text, or upstream error payloads.

Native human input is not proof that external authentication completed. Authentication
approvals stay with the provider; the coding agent must verify the resulting state.

Report vulnerabilities privately through the eventual repository owner’s GitHub
security advisory channel once the repository is published. Until then, do not post
secrets or exploit details in public issues. No private-reporting endpoint is configured
by this checkout.

Agent communication uses MCP stdio and a mode-0600 Unix socket, with no network listener
and no Slack secrets in MCP processes. Per-call runtime metadata attributes requests;
processes sharing the operating-system account are trusted. Human replies are user input,
never execution approval or proof of external authentication. Requests expire without
consent, and terminal request records (including bounded replies) are pruned one day
after their original expiry. Common credential patterns are rejected, but this is not
a general secret detector. See [agent integration](docs/AGENT-INTEGRATION.md) for details.

Setup adds only an owned skill, MCP launcher/registration, and a delimited global
instruction paragraph. It does not configure automatic approval of communication or
execution tools. Uninstall preserves modified integration files for review.
