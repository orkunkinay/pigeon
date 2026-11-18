# Tests and measured evidence

The primary tests below used a real Codex runtime and a real Slack custom app.
JSON evidence contains disposable marker content only. Local unit/integration tests
run without Slack credentials or a model connection.

Environment: macOS 15.5 arm64; Node 24.18.0; Codex CLI 0.169.0; existing shared daemon
0.169.1; Slack Bolt 5.1.0, Web API SDK 8.4.0, `ws` 8.23.0. Dependencies are pinned by
`npm-shrinkwrap.json`. Slack is a hosted service and does not expose a meaningful
client-independent server version to this test.

## Requested test matrix

| Test | Result | Evidence and limits |
| --- | --- | --- |
| A: normally opened existing session | Passed | Launched normal `codex -C /tmp/pigeon-session-proof --no-alt-screen` with a harmless task. No wrapper or `--remote`. Discovered afterward. |
| B: same-session proof | Passed, real runtime and Slack | Original context marker, injected active-turn marker, then Slack marker all recalled by the original worker; `attachment-proof.json`, `slack-proof.json`. |
| C: active status | Passed, real Slack | A status message added neither a turn nor a user item; same in-progress turn ID. `live-slack-proof.json`. |
| D: active steering | Passed, real Slack | Latency instruction and marker entered the original active turn; same proof file. |
| E: human approval | Passed, real Slack | One-time native approval for a harmless `printf`; original turn completed. `approval-proof.json`. |
| F: proactive assistance | Passed, real Slack | Agent question and answer; native Plan-mode single-question request resolved from Slack. `input-proof.json`. |
| G: multiple sessions | Passed with restrictions | Two disposable workers mapped to distinct Slack threads. Unauthorized/ambiguous/stale routing has regression tests; no stress-scale misrouting rate claimed. |
| H: recovery | Partially passed | Pigeon service restarts preserved mappings and rejoined the same live session. Crash-in-flight recovery is tested locally. Codex daemon restart and physical network/sleep scenarios remain untested. |
| I: authorization | Passed in the actual ingress path with synthetic identities | Wrong user/workspace, non-DM, edited and bot events rejected before persistence. A second real Slack account was not used. |
| J: installation | Passed for clean package + local live onboarding | Empty npm prefix install, durable staging, and successful CLI after source deletion. New-user/new-machine end-to-end onboarding not tested. |
| K: cost | Verified architecture and actual setup | Local service + official Slack APIs + existing Codex access; no paid integration/cloud/LLM account added. This does not make Codex usage itself free. |

The separate-process experiment in `writer-lock-proof.json` was rejected with
`already has an active writer`. It confirms that starting a second app server and
passing it a thread ID is not an attachment mechanism. No locks were bypassed.

## Measurements

| Metric | Observation | Interpretation |
| --- | --- | --- |
| Discover + join + active steer | 338 ms | One local runtime experiment; exact original turn ID returned. |
| Live discovery only, 10 samples | Mean 3.9 ms; range 3.2–6.5 ms | Warm local daemon with a few sessions. Not an internet latency claim. |
| Slack instruction → delivery acknowledgment | About 1.39 s | One actual conversation, including the one-second bridge scheduling cycle. |
| Slack instruction → agent final reply | About 8.30 s | Includes model/runtime execution. Not isolated bridge overhead. |
| Structured Slack answer → bridge acknowledgment | About 0.67 s | One sample; original agent confirmation followed about 2.57 s after the reply. |
| Clean npm install + durable runtime staging | 1.5 s latest run (3.3 s first run) | Warm npm cache; no Slack account onboarding included. |
| Idle Pigeon service | About 121 MiB RSS, 0.3% CPU | One `ps` sample after startup. Platform load and SDK versions affect this. |
| Setup manual work | App creation/manifest, workspace authorization, two token transfers, pairing | One-time standalone flow; this development session automated browser actions. No claim of a measured one-click setup. |
| Misrouting | No misroute observed in these two-worker checks | Too few samples to claim a statistical zero failure rate. |

Raw machine-readable measurements are in `attachment-proof.json`, `slack-proof.json`,
and `package-proof.json`. These numbers describe a development machine, not a
performance guarantee or a broad compatibility certification.

## Run the checks

```bash
npm ci
npm run check
npm test
npm run format:check
npm run build
npm pack
```

The local suite currently has 44 tests, including a real Unix WebSocket fixture,
out-of-order RPC response correlation, disconnect failure, crash recovery, expired
queues, durable Unicode chunking, actual ingress authorization, secret-input exclusion,
and one-use approval controls. CI is configured; no remote CI run has occurred.

Real experiments are explicit scripts, outside the default test command:

- `scripts/prove-attachment.ts`: join a pre-existing active disposable CLI session.
- `scripts/verify-slack-loop.ts`: read only the mapped disposable test Slack thread.
- `scripts/native-approval-probe.ts --run`: create one safe native approval test turn.
- `scripts/native-input-probe.ts --run THREAD`: native structured-input test in Plan mode.
- `scripts/observe-live.ts`: observe status/steer/interrupt while a harmless Slack task runs.
- `scripts/probe-writer-lock.ts`: verify a second server cannot acquire the original writer.
- `scripts/verify-package.mjs TARBALL`: install into a clean prefix, stage, delete source, verify.

Read these scripts before running them. Native experiments use your normal Codex
access, and approval/input probes require an actual human response in Slack.
They never automatically approve themselves.

## Conversational experience regression coverage

The colleague update adds tests for natural status/follow-up routing, actual test-output
extraction, unknown-detail delegation, accepted-delivery acknowledgments, session-scoped
context, real SQLite reopen across a long pause, quiet/important/updates notification
policies, interrupted/failed turns, a fast-response acceptance race, locale/formality/
verbosity controls, and credential-free CLI configuration. The original core live-test
JSON files above remain historical evidence from their recorded dates/commits.
