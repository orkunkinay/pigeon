# Release readiness

This is a working **0.1.0 preview**, prepared for review and publication. It is not
a claim that all Codex surfaces or every requested reliability scenario are supported.

Completed locally:

- TypeScript build, 20 local tests, formatting, package installation checks.
- Live Slack continuity, active status/steer/interrupt, approval and structured-input tests.
- Keychain-backed credentials and persistent macOS background service.
- README, visual reconstruction, architecture, security, compatibility, research,
  troubleshooting, contribution guidance, CI configuration and MIT license.
- Small commits with the requested local Git identity and no attribution trailers.

Publishing status:

- The existing `origin` points to `https://github.com/orkunkinay/pigeon.git`; inspection
  found an empty public repository. It has been preserved, with no pushes or remote edits.
- `Murat-Barkin-Kinay` exists. A request for `Murat-Barkin-Kinay/pigeon` returned 404
  to the available account. That establishes absence of a visible repository, not a
  guarantee of availability or authority to create one under that account.
- Bare npm `pigeon` already names a different package. `@pigeon-dev/cli` was not
  found in the registry; scope ownership has not been established. Do not publish
  until the maintainer chooses an owned scope and repository destination.
- No npm publish, GitHub repository creation, push, release, billing setup, or paid
  service registration has been performed.

Before calling a future release production-ready:

1. Resolve the live-only subscribe race with upstream support, or explicitly accept
   the preview restriction. See `UPSTREAM.md`.
2. Exercise dedicated desktop/IDE surfaces independently; never infer their support
   from history visibility.
3. Test physical sleep, network loss, reboot, and daemon restart in an isolated environment.
4. Add long-running/many-session stress and adversarial concurrency coverage.
5. Have another developer complete fresh-account onboarding without assistance.
6. Review the security model independently and configure private vulnerability reporting.

A maintainer can publish this as an explicitly scoped preview after review. Native
screenshots/files, multi-question forms, and an optional MCP server remain future
features, not hidden prerequisites for the working shared-daemon experience.
