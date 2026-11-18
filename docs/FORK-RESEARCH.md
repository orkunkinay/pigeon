# Fork routing investigation

Baseline: Codex CLI 0.169.0, local shared daemon; schemas generated with the installed CLI rather than assuming upstream main matches. Existing working components are Socket Mode ingress, SQLite inbox/outbox, exact thread bindings, native approval correlation, MCP-over-Unix-socket human requests, and immutable LaunchAgent installation.

The old router treats almost all unknown text as instructions. That sends discussion into main and must be replaced with a conservative discuss-first boundary. Read-only test counts can remain deterministic.

Native `thread/fork` accepts a completed `lastTurnId`, sandbox and configuration overrides, and an independent thread identity. Its prediction mode inherits privileged tools and prevents configuration overrides, so it is unsuitable for restricted discussion. Ordinary forks require explicit isolation checks. Active work must be observed separately from inherited completed history.

New legacy-history threads reject `thread/turns/list` with -32601 (`list_turns is not supported yet`). Observation now falls back specifically for that capability error to `thread/read(includeTurns: true)`. Other errors remain errors. This is independent of session control and does not start or steer a turn.

Relevant primary sources: [official App Server protocol](https://learn.chatgpt.com/docs/app-server), [upstream thread parameters](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/thread.rs), and [tool registration](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs). Installed schemas and focused live experiments take precedence over upstream examples.
