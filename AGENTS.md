# Working on Pigeon

These instructions apply throughout this repository. Follow the user's current request and any more specific instructions in the files you work on.

## Start here

1. Read `README.md`, `CONTRIBUTING.md`, `SECURITY.md` and `docs/ARCHITECTURE.md`.
2. Run `git status -sb` and look at recent commits before editing. Other sessions may be working in this checkout. Preserve unrelated work: do not reset, overwrite, stash, or stage it. Stage files by explicit path, never `git add -A` or `git commit -a`.
3. Inspect the implementation before describing or changing behavior. Documentation can lag the code. Distinguish what is verified (see `docs/COMPATIBILITY.md`, `docs/TESTING.md`) from what is experimental or not built.

Pigeon is a local macOS companion that connects Codex sessions to Slack. It joins the shared Codex daemon over a local socket, talks to Slack through Socket Mode, and stores state in SQLite. It has no cloud component and no second model.

## Commands

```bash
npm ci
npm run check          # tsc --noEmit
npm test               # tsx --test tests/*.test.ts (no Slack or Codex login needed)
npm run format:check   # npm run format to fix
npm run build
node dist/cli.js doctor
```

Scripts in `scripts/` that talk to a real Codex or Slack (`prove-attachment`, `verify-slack-loop`, `native-*-probe`, `verify-awareness`, and so on) are opt-in, consume real usage, and send real messages. Read one before running it.

## Repository map

- `src/cli.ts`: commands (`setup`, `status`, `doctor`, `sessions`, `voice`, `pair`, `install-service`, `install-agent`, `logs`, `uninstall`, `mcp`).
- `src/transports/slack/`: Socket Mode bridge and authenticated ingress.
- `src/router.ts`: deterministic `classify()` and `selectSession()`.
- `src/runtimes/codex/`: JSON-RPC client and adapter (sessions, snapshot, attach, deliver, interrupt).
- `src/approvals.ts`: native command approvals and single-question input as Slack controls.
- `src/store.ts`: SQLite inbox, outbox, bindings, approvals, watches.
- `src/conversation/`: voice, status replies, notification policy.
- `src/agent/`: MCP server, tool contracts, local IPC, skill and installer.
- `src/daemon/`, `src/security/`: LaunchAgent and runtime staging, Keychain.
- `website/`: the public site and docs (see below).

## Rules that keep Pigeon trustworthy

- A runtime adapter exposes only what it can observe and control.
- Never substitute a resumed transcript for a running worker, retry an uncertain instruction, broaden a security policy, or choose an ambiguous session.
- Add a regression test for any routing, authorization, persistence or protocol fix.
- Never put tokens, private session logs, local config or unredacted screenshots in code, fixtures, docs or commits.
- Do not claim features that are not implemented. There is currently no conversational fork and no session recovery manager.

## Website (`website/`)

A static site published at https://orkunkinay.github.io/pigeon/. Entry point: `website/index.html`.

- Docs content: `website/src/docs/*.html`. Slack setup diagrams: `website/src/shots.mjs`. Shared CSS and JS: `website/assets/`.
- `website/docs/*.html` and `website/assets/scripts/search-index.js` are generated. Edit the sources, then run:

```bash
node website/build.mjs                     # regenerate docs pages and the search index
python3 -m http.server -d website 8000     # preview at http://localhost:8000
npm run deploy:site                        # publish website/ to the gh-pages branch
```

- Use relative links only (no leading `/`) so the site works under the `/pigeon/` subpath.
- Label every visual honestly: "Real rendering", "Illustrative diagram", or "Design sketch". Do not present a drawing as a screenshot.
- Keep claims in line with `docs/COMPATIBILITY.md`. Mark anything unbuilt as "Not built".
- Commit changes to `website/` before running `npm run deploy:site`; the script refuses to publish with uncommitted site changes. It force-pushes `gh-pages` and requests a Pages build through `gh`.
- GitHub Actions is unavailable on this account (billing lock), so publishing is direct from `gh-pages`. Do not add Pages workflows.

## Git

- Identity for this repo: `orkunkinay` <orkunkinay@sabanciuniv.edu>.
- Use clear, professional commit messages without attribution trailers.
- Do not push, create releases, or publish to npm unless asked.
