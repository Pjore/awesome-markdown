# awesome-markdown — Project Guide for AI Agents

## Purpose

Lightweight, git-backed kanban system. Pluggable persistence providers
(localStorage in-browser, local-fs markdown sidecar), independent sync-engine
for git + external-change notifications, and a React drag-and-drop kanban UI.

## Architecture

Monorepo with pnpm workspaces:

- `packages/contracts` — Zod v4 schemas + inferred TypeScript types (shared)
- `packages/provider-localstorage` — In-browser localStorage provider
- `apps/kanban-ui` — React 19 + Vite 8 + Tailwind v4 SPA with @dnd-kit
- `apps/provider-fs` — Fastify v5 sidecar (markdown files + YAML frontmatter)
- `apps/sync-engine` — File watcher, git auto-commit, SSE event emitter; webhook-triggered pull (primary) + 10 min fallback polling

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | React 19, Vite 8, Tailwind v4, @dnd-kit |
| API/sidecar | Fastify v5 + `fastify-type-provider-zod` |
| Validation | Zod v4 — `import { z } from "zod"` |
| Git | simple-git + GitHub App installation tokens (`@octokit/auth-app`) |
| File watching | chokidar |
| Markdown | gray-matter |
| Live channel | Native SSE (no WebSocket) |
| Monorepo | pnpm workspaces |

## Key Conventions

- **Routes**: Always `FastifyPluginAsyncZod` — Zod schemas auto-type request properties
- **Validation**: Zod v4 throughout; import from `"zod"` only
- **Imports**: `.js` extension in all local API/sync-engine imports (ESM)
- **Shared types**: Import from `@awesome-markdown/contracts`
- **Content dir**: `./content` relative to repo root
- **Git auth**: GitHub App installation tokens via `@octokit/auth-app`; required vars: `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_PATH`; App needs `Contents: read/write`
- **No `any`** in `packages/contracts`; all cross-package calls typed via exports

## Ports (defaults)

| Service | Port |
|---------|------|
| kanban-ui dev server | 5173 |
| provider-fs sidecar | 7701 |
| sync-engine | 7402 |

## Dev Commands

```bash
# Install (requires Node.js 22+)
pnpm install

# Quality gates (run before every commit)
pnpm typecheck && pnpm lint

# Start all services (canonical — uses PM2, survives terminal close)
./scripts/services start

# Service management
./scripts/services status          # show name/PID/uptime/restarts/port/owner
./scripts/services logs <name>     # stream logs (ui | fs | sync)
./scripts/services stop            # stop and delete all services
./scripts/services switch <path>   # move services to another worktree

# Underlying per-service commands (used by the wrapper internally)
# pnpm --filter kanban-ui dev
# pnpm --filter provider-fs dev
# SYNC_ENGINE_REPO_ROOT=$(pwd) pnpm --filter sync-engine dev

# Tests
pnpm test                          # all Vitest suites
pnpm verify:ui                     # aggregate agent-browser UI smoke suite
pnpm --filter kanban-ui verify:m3  # per-milestone agent-browser
```

## Environment / .env Files

Each app ships a `.env.example` — copy to `.env` and fill in values.
`.env` is gitignored; `.env.example` is committed.

| App | Env file | Key variables |
|-----|----------|---------------|
| `apps/provider-fs` | `apps/provider-fs/.env` | `PROVIDER_FS_PORT`, `PROVIDER_FS_HOST`, `PROVIDER_FS_CONTENT_ROOT` |
| `apps/sync-engine` | `apps/sync-engine/.env` | `SYNC_ENGINE_REPO_ROOT` (required), `SYNC_ENGINE_TARGET_BRANCH`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`/`GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_APP_WEBHOOK_SECRET` (webhook primary trigger; polling is fallback at 10 min default) |
| `apps/kanban-ui` | `apps/kanban-ui/.env` | `VITE_PROVIDER_FS_URL` (pre-fills Settings panel URL) |

`provider-fs` and `sync-engine` use Node 22 `--env-file-if-present` — the `.env`
file is loaded by the `dev` script automatically. Vite loads `.env` natively.

## Sync-engine: Feature Branch Workflow

The sync-engine syncs against the **current local branch** by default
(`git branch --show-current`). When working on a feature branch, ensure:

1. `apps/sync-engine/.env` contains `SYNC_ENGINE_TARGET_BRANCH=<your-branch>`, **or**
2. The env var matches whatever branch is checked out (`git branch --show-current`).

If `SYNC_ENGINE_TARGET_BRANCH` is unset, the engine reads the current branch
at startup — so checking out the feature branch before starting the engine is
sufficient for most workflows.

## File Constraints

| Type | Limit |
|------|-------|
| TypeScript source files | 400 lines max |
| AI files (instructions, prompts, skills) | 600 words max |

## Security

- **Never commit `GITHUB_APP_PRIVATE_KEY` or any token** — load from `.env` (gitignored)
- Use `.env.example` as template; document required vars there
- Mask credentials when confirming: `${VAR:0:8}...`

## Workflow

- **Conventional Commits** — `type(scope): message`
- **Branch + PR** — never commit to `main` directly
- Load `branch-and-pr` skill before starting any feature work
- Load `commit-work` skill before making commits

## Browser Tooling — Prefer `agent-browser`

For any frontend work against `kanban-ui`, **default to `agent-browser`**
over the built-in browser tool (`open_browser_page`, `read_page`,
`screenshot_page`, `click_element`). Load the `agent-browser` skill;
project-specific notes (seeding, testids, DnD, noise filtering) live in
`.github/skills/agent-browser/references/awesome-markdown-notes.md`.

`agent-browser` is required for: annotated screenshots, DnD/animation
debugging, full console logs, HAR network capture, request mocking,
arbitrary JS scraping via `eval`, video recording, and visual/structural
regression diffs. The repo's `pnpm verify:ui` suite uses it.

The built-in browser tool is acceptable for: quick "does the URL load?"
sanity checks during chat, inline JPEG screenshots when the user wants to
see a result without a `view_image` follow-up, and trivial text scrapes.
Its default viewport is narrow (~700 px) and truncates the kanban board —
do not use it for layout debugging.

Full comparison: [docs/agent-browser-vs-browser-tool.md](../docs/agent-browser-vs-browser-tool.md).
