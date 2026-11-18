# Research notes

Investigation date: 2026-11-18. Local experiments take precedence over assumptions
from bridge READMEs. Upstream source was inspected at
[`openai/codex` 67d8266e](https://github.com/openai/codex/tree/67d8266e06e469e5aef78a23881c7e19c37030b0).
Installed binaries were CLI 0.169.0 and daemon 0.169.1; the upstream snapshot is not
claimed to be the exact build source of either installed binary.

## Why the shared daemon matters

The implementation’s `resume_running_thread` path returns an existing in-memory
thread when the request reaches its owner. In a different process, the active-writer
lock prevents taking that thread over. These are distinct operations even when
both use the name `thread/resume`.

Source paths inspected included:

- `codex-rs/app-server-daemon/README.md`: lifecycle, default control socket, client environment.
- `codex-rs/tui/src/lib.rs` and `startup_orchestration.rs`: implicit daemon reuse and embedded fallback.
- `codex-rs/app-server/src/request_processors/thread_processor.rs`: live resume, subscriptions, storage fallback.
- `codex-rs/app-server/src/request_processors/turn_processor.rs`: loaded-thread turn dispatch.
- `codex-rs/app-server/src/thread_state.rs`: per-connection subscriptions.
- `codex-rs/app-server-protocol/src/protocol/v2/`: turn preconditions, approval and input wire types.
- `codex-rs/app-server/tests/suite/v2/thread_resume.rs`: active-writer rejection tests.
- `codex-rs/stdio-to-uds/src/lib.rs`: raw byte forwarding by `app-server proxy`.

The machine’s existing daemon exposed the Pigeon work session and other root
sessions. The probe read metadata only from unrelated sessions. A disposable
normally launched TUI supplied the actual steering/context proof.

No memory patching, terminal injection, rollout edits, lock removal, or private
credential extraction was attempted. A dedicated desktop attachment claim would
require its own runtime and UI test; it is not inferred from CLI success.

## Ecosystem comparison

These source snapshots were cloned for inspection outside the Pigeon repository.
No implementation code was copied into Pigeon. Licenses below describe what was
found in the inspected metadata, not a legal assessment of every file.

| Project / snapshot | Source behavior inspected | Implication for Pigeon |
| --- | --- | --- |
| [impri2/codex-slack](https://github.com/impri2/codex-slack/tree/58e7d05) | `src/codex/app_server_client.js` uses a shared WebSocket server, loaded listing and resume; separate shell executor also supports tmux. No clear top-level license found in this inspection. | Shared server design is useful; starting a separate server or tmux shell control does not prove attachment to every existing UI. |
| [BHSDuncan/codex-slack-bridge](https://github.com/BHSDuncan/codex-slack-bridge/tree/0820977) | `src/codex/appServerAdapter.ts` spawns a private `codex app-server` and has steer/resume methods. Apache-2.0. | Rich native events are possible, but a private process cannot take over a thread owned elsewhere. |
| [earonesty/codex-slack](https://github.com/earonesty/codex-slack/tree/ff7ae28) | `src/rpc.ts` spawns its runtime; `src/codex.ts` restores permission overrides during resume and supports steering. MIT. | Existing thread IDs alone are insufficient evidence of a shared worker. Pigeon avoids permission overrides on live joins. |
| [nishantmodak/call-a-human-mcp](https://github.com/nishantmodak/call-a-human-mcp/tree/4830d83) | `server.py` and `channels/slack.py` correlate blocking tool requests and Slack replies. Apache-2.0 in project metadata. | A good agent-initiated interaction pattern, but an MCP tool invocation is not an independent channel into a running turn. |
| [Kai-Zhang/claude-slack-bridge](https://github.com/Kai-Zhang/claude-slack-bridge/tree/6e1e48b) | `hooks/pre_tool_use.sh` polls an inbox for queued inject/stop requests. No clear top-level license found. | Hooks can provide a safe checkpoint for runtimes that support them; delivery depends on reaching that checkpoint. |
| [meharajM/whatsapp-mcp](https://github.com/meharajM/whatsapp-mcp/tree/e8629a2) | `src/mcp/tools/ask-question.ts`, incoming-message tool, and queue modules provide messaging tools. ISC in package metadata. | Useful queue/correlation ideas; does not establish a Codex live-control API. |
| [glenncalleja/wakewire](https://github.com/glenncalleja/wakewire/tree/0226b6b) | `src/sinks/codex-app-server.ts` resumes a thread and rejects an active one as busy in the inspected path. MIT. | Event delivery into idle threads differs from non-interrupting status and active steering. |

A secondary search surfaced WakeWire and more remote-control wrappers. Features
were evaluated from these specific source paths rather than popularity or names.
This table describes snapshots, not all capabilities of future versions.

## Slack and cost

Slack Socket Mode is an outbound WebSocket integration with no public webhook.
Slack’s own documentation notes that Socket Mode apps cannot currently be listed in
the public Marketplace; a per-workspace custom app is therefore the honest initial
installation model. [Socket Mode documentation](https://docs.slack.dev/apis/events-api/using-socket-mode/).

Manifest creation through the API needs a configuration token with
`app_configurations:write`. Pigeon instead supplies a manifest through the developer
UI, avoiding possession of a token able to configure other applications.
[Manifest creation API](https://docs.slack.dev/reference/methods/apps.manifest.create/).

Pigeon consumes one of Slack Free’s ten app slots. Free history visibility is 90 days;
older content can be deleted under Slack’s retention policy. Local mappings do not
extend Slack’s retention. [Slack Free usage limits](https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces).

Slack generally permits one posted message per second per conversation and supplies
`Retry-After` on HTTP 429. Pigeon paces its durable outbox and uses the official SDK’s
retry handling. Production input uses Socket Mode events, not history polling.
[Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/).

No extra LLM endpoint, billing registration, paid tunnel, managed queue, or cloud
subscription was used. This removes Pigeon infrastructure fees; it does not remove
Codex’s own eligibility, subscription, or usage requirements.
