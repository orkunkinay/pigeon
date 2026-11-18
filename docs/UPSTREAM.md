# Proposal: an atomic live-only thread subscription

Status: design proposal, not submitted upstream and not installed as a Codex patch.
The shared daemon already makes Pigeon’s core flow possible. This proposal closes
one remaining correctness gap rather than adding an alternative agent runtime.

## Problem

`thread/loaded/list` followed by `thread/resume` has a check/join race. Resume can
join a live thread or load persisted history. A companion that promises attachment
to an already-running worker needs an atomic distinction.

## Proposed contract

Add an optional `requireLoaded: boolean` to `thread/resume`, defaulting to false for
existing clients. Evaluate it under the existing resume permit, after attempting the
in-memory running-thread path and before any stored-history fallback. When true and
no live thread exists, return a specific `THREAD_NOT_LOADED` error. Never read stored
history, acquire a new actor/writer, or construct a replacement worker on that path.

Return an opaque runtime incarnation ID on initialize and a worker incarnation ID on
successful live subscription. These let a companion distinguish reconnection to the
same worker from a daemon restart and conversation restoration.

On live subscription, replay currently pending native requests with the existing
resolution semantics. Make owner/subscriber approval arbitration explicit in the
protocol documentation. A live-only unsubscribe should release the subscription;
it should not implicitly cancel active work owned by another client.

## Implementation touchpoints

In the inspected source, add the defaulted protocol field to `ThreadResumeParams`,
then check it in `thread_resume_inner` when `resume_running_thread` returns
`NotRunning`. Update Rust struct literals and generated schemas/bindings; retain
backward-compatible false behavior for existing clients. Do not implement the check
outside the resume permit.

Required regression tests:

- Two clients join one already-running worker and observe the same active turn.
- An unloaded thread fails without acquiring its writer lock or reading history.
- A concurrent unload cannot cross the live-only guard into cold resume.
- A different server’s active-writer lock remains intact.
- A reconnect replays a pending approval; competing responses resolve once.
- A daemon restart changes incarnation identity even when the thread ID persists.

Pigeon would enable strict attachment only after protocol negotiation confirms this
field’s enforcement. Sending an unknown flag to an old server is unsafe: permissive
JSON deserialization could ignore it. No speculative local binary modification is
necessary for the verified current integration.
