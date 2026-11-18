# Troubleshooting

Start with `pigeon doctor` (or `node dist/cli.js doctor` from a checkout).

| Symptom | Check |
| --- | --- |
| Slack not configured | Run setup and complete the local credential form. |
| Keychain credential unavailable | Unlock the login Keychain and allow the intended executable access. Never paste tokens into logs or an issue. |
| Service stale/stopped | Run `pigeon install-service`. Inspect `pigeon logs`. The service needs the Node installation recorded at setup. |
| Slack disconnected | Check network access and app/token revocation. Socket Mode reconnects automatically after ordinary connection loss. |
| No controllable sessions | Open a shared-daemon Codex session. `codex app-server daemon version` should report a reachable daemon. |
| Daemon package missing | Install a supported official Codex distribution. Review `codex app-server daemon bootstrap --help`; Pigeon does not replace broken managed packages. |
| A window is absent from the list | It may use a private/embedded server, another `CODEX_HOME`, a custom executor, or unsupported client flags. History alone does not establish control. |
| Several projects | DM `sessions`, select a project, and write in its reply thread. The original ambiguous message was not executed. |
| Stale mapping | Select explicitly again. Pigeon never falls through to another project. |
| Approval unavailable | It may have expired, disconnected, resolved locally, or requested an unsupported permission. Review in Codex. |
| Secret/multi-question input | Respond locally in Codex. Those contents are not forwarded. |
| “Delivery could not be confirmed” | Check the current session before resending. Pigeon deliberately does not replay uncertain instructions. |
| Queued message expired | Instructions expire after five minutes. Send a fresh instruction if it is still relevant. Offline stop requests are never queued. |
| Old replies after reconnect | Pigeon catches up the latest turn. A post acknowledgment lost during a crash can produce duplicate notifications. |

`Pause` requests a native turn interruption. `Continue` is a new message in the same
conversation; it does not resurrect a terminated shell command or restore a checkpoint.

To inspect the service locally:

```bash
launchctl print gui/$(id -u)/dev.pigeon.companion
```

Uninstall with `pigeon uninstall`. This removes Pigeon’s LaunchAgent, local runtime,
state and its two Keychain items. Uninstall does not delete the Slack application,
Codex, Codex settings, or conversation history. Stop the bridge before manually
removing its runtime directory.
