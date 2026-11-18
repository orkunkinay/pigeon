# Pigeon’s colleague voice

Pigeon should sound like someone keeping an eye on the work: brief, warm, technically
specific, and comfortable saying what it does not know. The default voice is
`colleague`. No mascot jokes, repeated greetings, default “boss,” or celebratory emojis.

For a known test result:

```text
You: Hey, how’s it going?
Pigeon: 18 passed, 2 failed in AgentLane’s latest test run. Codex is still working.
You: What’s failing?
Pigeon: The latest output on AgentLane lists:
        FAIL browser/reconnect.test.ts
You: Can you tell Codex to fix those first?
Pigeon: Passed that to Codex on AgentLane.
```

Those counts and names must exist in observed output. If failure details are missing,
Pigeon passes the question and the preceding Slack exchange to the original worker.
It acknowledges delivery only after the runtime accepts it; it does not pretend to
have answered or fixed the problem. Quotes and messages from Codex stay attributed.

## Customize without editing JSON

```bash
pigeon voice
pigeon voice set formality formal
pigeon voice set humour off
pigeon voice set verbosity detailed
pigeon voice set proactiveness quiet
pigeon voice set language tr
pigeon voice set address "Dr. Lee"
pigeon voice set address none
pigeon voice reset
```

| Option | Default | Choices |
| --- | --- | --- |
| `voice` | `colleague` | `colleague` |
| `formality` | `casual` | `casual`, `neutral`, `formal` |
| `humour` | `dry` | `dry`, `off` |
| `verbosity` | `brief` | `brief`, `normal`, `detailed` |
| `proactiveness` | `important` | `quiet`, `important`, `updates` |
| `language` | `en` | English `en`, Spanish `es`, Turkish `tr`; regional variants such as `es-MX` work |
| `address` | none | An optional name or preferred address, used sparingly |

The running service picks up changes within five seconds. No restart, credentials,
extra model, or personality-building workflow is needed. Unknown options and unsupported
bridge languages are rejected explicitly. Commands, paths, and quoted Codex output
are kept verbatim; changing the preferred language does not retroactively translate
a previous message. New nuanced replies receive the preferences in the same Codex
session, subject to its existing instructions. The user’s explicit request for detail
or a particular style takes precedence over defaults.

Humour is optional guidance for that original worker, not a canned joke appended to
every notification. Approval, authentication and error templates stay literal. Pigeon
does not use another model to rewrite or “humanize” project output.

## Notifications that deserve attention

- `important`: human assistance, authentication/decision requests, failed/interrupted
  turns, explicit reply/update requests, and completed turns. Routine commentary and
  tool/file events do not ping the user.
- `quiet`: human assistance, failures/interruption, and explicitly requested replies
  or completion watches still get through; unsolicited successful completion does not.
- `updates`: also allows agent progress, coalesced to at most once per minute per session.
  It still does not post routine tool events.

Final-answer messages are normally held until native turn completion. An interrupted
turn is reported as interrupted, never as completed work. Long unsolicited replies are
clearly labelled excerpts; requested detail remains intact. Native approvals retain
all identity, expiry, complete-command display and one-time-decision checks.

Status recognition and attention detection are deterministic and intentionally limited.
The bridge does not invent milestones, count tests from an incomplete run, infer a
cause from an exit code, or mistake an agent’s future plan for an executed action.
Unknown nuance goes to the already-running worker using the existing control path.

## What Pigeon remembers

Pigeon stores **one bounded last question/reply per mapped Slack thread**, not an
independent conversation history or a second model memory. It keeps up to 2,000
characters of the question and 3,000 of the reply, with its timestamp and exact Codex
session identity. That provides referents for “those failures” and similar follow-ups.

There is **no 30-minute conversation cutoff**. A normal pause or service restart does
not discard the reference. Selecting a different project in the thread clears this
cache; orphaned mappings are pruned, and uninstall removes it. The worker receives
older context as timestamped background, not fresh evidence of present activity.
Slack threads, Codex sessions and tasks never expire because of this small cache.

For delivery races, Pigeon briefly retains the latest bounded agent reply per turn
and its outcome, so a very fast response is not lost before the acceptance RPC returns.
This buffer is capped at 100 replies and old completed-turn records are pruned after
24 hours. It remains local inside Pigeon’s protected SQLite directory. See SECURITY.md
for the broader retention and trust model.
