# Contributing to awesome-markdown

Thanks for your interest in improving awesome-markdown. This guide covers local setup, code conventions, testing expectations, and the pull request workflow.

## Code of Conduct

By participating in this project, you agree to follow the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js 22+
- pnpm 9+
- Git 2+
- Docker (optional, only needed for the Docker Compose path)

## Fork, clone, and install

```bash
git clone https://github.com/<your-username>/awesome-markdown.git
cd awesome-markdown
pnpm install
```

Copy local environment files as needed:

```bash
cp apps/provider-fs/.env.example apps/provider-fs/.env
cp apps/sync-engine/.env.example apps/sync-engine/.env
cp apps/kanban-ui/.env.example apps/kanban-ui/.env
```

Never commit `.env` files, private keys, or API tokens.

## Running the project locally

### Browser-only path

```bash
pnpm --filter kanban-ui dev
```

Open <http://localhost:5173> and choose **localStorage** in the UI.

### Full local stack

```bash
./scripts/services start
./scripts/services status
./scripts/services logs ui
./scripts/services logs fs
./scripts/services logs sync
./scripts/services stop
```

This starts:

- `kanban-ui` on port `5173`
- `provider-fs` on port `7701`
- `sync-engine` on port `7402`

If you enable remote sync, set `SYNC_ENGINE_REMOTE_ENABLED=true` and configure the GitHub App variables in `apps/sync-engine/.env`.

> **Remote HTTP provider warning:** the SSE `/events` endpoint can accept a `?token=` query parameter. Do not log raw request URLs in production, or the bearer token may be exposed in access logs.

## Branching and pull requests

- Never commit directly to `main`.
- Create a short, descriptive branch name such as `feat/board-routing`, `fix/sse-reconnect`, or `docs/oss-guides`.
- Open a draft pull request early when the work is ready for feedback.
- Mark the PR ready for review only after the quality gate passes.
- Use squash merge for completed pull requests.

## Commit format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): short summary
```

Common types include `feat`, `fix`, `docs`, `refactor`, `test`, and `chore`.

Example commit messages:

```text
feat(sync-engine): emit offline event after repeated push failures
fix(provider-fs): reject invalid item slugs on update
docs(architecture): explain provider selection flow
```

If AI assistance contributed to the commit, include this trailer:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Code style

- Use TypeScript with ESM-style local imports that include the `.js` extension.
- Import Zod from `zod`.
- Reuse shared contracts from `@awesome-markdown/contracts` instead of duplicating types.
- Keep changes focused and update related docs when behavior or workflows change.
- Run the formatter/linter stack before opening a PR.

## Testing requirements

Every pull request should run the full quality gate:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

UI verification is available with:

```bash
pnpm verify:ui
```

Per-milestone UI verification suites live under `apps/kanban-ui/agent-browser/mN/` and can be run individually with `pnpm --filter kanban-ui verify:mN`. Extend an existing suite rather than writing a new one from scratch.

Add or update tests when you change behavior, fix bugs, or introduce new interfaces.

### Seeding demo data for UI verification

In localStorage mode, the `?seed=mN` query parameter seeds demo boards into `localStorage["awesome-markdown:v1"]`. It only runs on the **home page** — loading `/boards/<slug>` directly on a fresh browser context will not seed data and the UI will show "Failed to load board". Load `/?seed=m3`, wait for the page to settle, then navigate into the board.

In provider-fs mode (sidecar running on port 7701), no seeding is needed — boards come directly from `content/`, so `/boards/<slug>` can be opened directly.

### UI element conventions

The UI exposes stable `data-testid` attributes (e.g. `board`, `column-header-<id>`, `swimlane-row-<id>`, `item-card-<id>`, `settings-btn`). Prefer testid-based selectors over CSS selectors in any UI automation — they're stable across styling and layout changes.

## Reporting bugs and requesting features

- Use **Bug report** for reproducible defects.
- Use **Feature request** for enhancements or product ideas.
- Use **GitHub Discussions** for open-ended questions or design conversations.
- Use [`SECURITY.md`](SECURITY.md) instead of a public issue for vulnerabilities.

Please search existing issues and discussions before opening a new thread.

## Maintainer note: repository visibility

After Milestone 4 is merged, set the GitHub repository visibility to **Public** via:

**Settings → General → Danger Zone → Change repository visibility → Make public**

This is a manual maintainer step and should not be automated.
