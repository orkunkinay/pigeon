# Compatibility

Evidence collected on 2026-11-18, macOS 15.5 arm64, Node 24.18.0,
Codex CLI 0.169.0 and managed app-server daemon 0.169.1. Capabilities are
runtime-dependent; version numbers alone do not guarantee attachment.

| Capability | Classification | Evidence or restriction |
| --- | --- | --- |
| Discover a normally opened CLI session | Implemented and verified | Disposable TUI session existed before Pigeon connected. |
| Attach to that live worker | Implemented and verified | Same original thread and active-turn IDs; worker recalled both context markers. |
| Slack → original session → Slack | Implemented and verified | Actual human Slack message and bot response; `slack-proof.json`. |
| Steering an active turn | Implemented and verified | `turn/steer`, guarded by `expectedTurnId`; `attachment-proof.json`. |
| Status without an agent turn | Implemented with restrictions | Recognized phrases read runtime state; tests cover routing. No independent summarizing model. |
| Interrupt active execution | Implemented with restrictions | Uses native interrupt; no OS process checkpoint. |
| Human command approval | Implemented and verified | Exact harmless command accepted once in Slack, original turn completed. |
| Structured user input | Implemented and verified | Single-question native request in Plan mode; answer delivered via Slack. |
| Default-mode question | Implemented with restrictions | Agent asked conversationally and received a normal next-turn answer; no native tool was used in that test. |
| File changes / permission bundles | Unsupported | Review in Codex. No broad/session approval button. |
| Proactive messages | Implemented and verified | Subscribed agent output and native requests arrive without polling Slack. First select the session. |
| Multiple sessions | Implemented with restrictions | Separate mappings verified for two test workers; stale/ambiguous routing tested. No large-scale stress result. |
| Pigeon restart | Implemented and verified | Exact bindings restored and runtime rejoined; no second worker. |
| Codex restart | Experimental | Retries discovery and only reconnects loaded identities; old native controls are invalidated. No interruption of unrelated work to test daemon restart. |
| Network loss / Mac sleep | Experimental | SDK reconnection and durable outbox implemented; physical sleep/network-drop tests not yet run. Slack is not a guaranteed offline inbox. |
| macOS service | Implemented and verified | LaunchAgent bootstrapped and restarted; reboot itself has not been tested. |
| CLI with `--no-daemon` | Unsupported | Private runtime has no shared control endpoint. |
| IDE sharing the daemon | Implemented with restrictions | Existing daemon exposed VS Code-sourced sessions. No claim for every extension version. |
| Dedicated Codex desktop app | Experimental / unverified | No test of this surface on this machine. |
| MCP / Slack screenshots | Unsupported | Neither is shipped in this preview. |
| Clean package install | See TESTING.md | Separate from full fresh-account Slack onboarding. |

Pigeon does not take ownership of saved thread history or bypass active-writer
locks. An old Codex client can fall back to an embedded runtime even while a daemon
exists; `doctor` tells you whether Pigeon can see a shared runtime, but cannot prove
that every window is attached to it.
