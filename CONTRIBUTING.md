# Contributing

Install Node 24+, then run `npm ci`, `npm run check`, `npm test`, and `npm run build`.
Use `npm run format` before committing. Tests never need Slack tokens or Codex login.
The explicit scripts in `scripts/` are opt-in real integration experiments and consume
normal Codex usage; read their prompts first.

Keep changes narrow. A runtime adapter must expose what it can actually observe
and control. Do not substitute a resumed transcript for a running worker, retry an
uncertain instruction, broaden a security policy, or choose an ambiguous session.
Add a regression test for routing, authorization, persistence, or protocol fixes.

Never include private session logs, local configuration, or tokens in an issue,
fixture, screenshot, or commit. Evidence files contain only disposable test content.
Record the runtime version and distinguish mocks from live tests.

For another runtime or messaging platform, start with its continuity and identity
contract. Extend the current seams when there is a concrete integration to support;
avoid building a general agent framework in anticipation of one.
