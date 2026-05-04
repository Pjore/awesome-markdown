# awesome-markdown — Project Guide for AI Agents

## Purpose

Lightweight, git-backed kanban system. Flat pool of markdown items projected through query-based boards. Pluggable providers, isomorphic filter engine, independent sync-engine.

## Domain Model

All domain objects live as `.md` files in `content/` with `entityType: item | board | axis`. Boards project the item pool through filter rules — boards don't own items. Drop mutations are derived from the combined cell filter (board ∧ column ∧ swimlane); non-invertible filters (e.g., `or`/`any`) produce read-only cells. One drop = one file write. Items in a board's `boards[]` that match no column appear in the `/homeless` view.

## Architecture

Monorepo with pnpm workspaces:

- `packages/contracts` — Zod v4 schemas + inferred TypeScript types (shared)
- `packages/filter-engine` — Isomorphic filter evaluate, invertibility analysis, mutation derivation
- `packages/provider-localstorage` — In-browser localStorage provider
- `apps/kanban-ui` — React 19 + Vite 8 + Tailwind v4 SPA with @dnd-kit
- `apps/provider-fs` — Fastify v5 sidecar (flat content pool via REST, port 7701)
- `apps/sync-engine` — File watcher, git auto-commit, SSE; webhook pull (primary) + 10 min polling (port 7402)

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | React 19, Vite 8, Tailwind v4, @dnd-kit |
| API/sidecar | Fastify v5 + `fastify-type-provider-zod` |
| Filter engine | `packages/filter-engine` (isomorphic, no Node globals) |
| Validation | Zod v4 — `import { z } from "zod"` |
| Git | simple-git + GitHub App tokens (`@octokit/auth-app`) |
| Markdown | gray-matter + chokidar |
| Live channel | Native SSE (no WebSocket) |

## provider-fs Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards` | List boards |
| GET | `/axes` | List axes |
| GET | `/boards/:slug/render` | Cells with items + invertibility flags |
| GET | `/boards/:slug/homeless` | Items matching no column cell |
| GET | `/items/:slug` | Fetch item |
| POST | `/items` | Create item (slug auto-generated) |
| PATCH | `/items/:slug` | Update item fields (one file write) |
| DELETE | `/items/:slug` | Delete item |

## Key Conventions

- **Routes**: `FastifyPluginAsyncZod` — Zod schemas auto-type request properties
- **Validation**: Zod v4; import from `"zod"` only
- **Imports**: `.js` extension in all local ESM imports
- **Shared types**: Import from `@awesome-markdown/contracts`
- **Content dir**: `./content` relative to repo root
- **Git auth**: `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` (or `_PATH`); App needs `Contents: read/write`

## Dev Commands

```bash
pnpm install && pnpm typecheck && pnpm lint
./scripts/services start
./scripts/services status | logs <ui|fs|sync> | stop
pnpm test && pnpm verify:ui
```

## Environment

Each app ships `.env.example` — copy to `.env`. Key vars:
- `apps/sync-engine`: `SYNC_ENGINE_REPO_ROOT` (required), `SYNC_ENGINE_TARGET_BRANCH`, GitHub App vars, `GITHUB_APP_WEBHOOK_SECRET`
- `apps/provider-fs`: `PROVIDER_FS_PORT`, `PROVIDER_FS_CONTENT_ROOT`
- `apps/kanban-ui`: `VITE_PROVIDER_FS_URL`

## Sync-engine

**Feature branch:** Set `SYNC_ENGINE_TARGET_BRANCH=<branch>` in `.env`, or check out the branch before starting the engine.

**Coder webhook URL:** `https://7402--<agent>--<workspace>--<owner>.coder.<domain>/webhooks/github` (double-dash separators). Verify: `curl -X POST http://localhost:7402/webhooks/github` → `{"ok":false,"reason":"signature"}` (not 404).

**Port sharing:** Port 7402 must be set to **Public** in the Coder workspace "Shared Ports" panel. GitHub webhooks cannot pass Coder's proxy auth challenge — "Authenticated" sharing causes all deliveries to return 401 before they reach the sync-engine.

**Puller dirty-check:** If `content/` has any unstaged changes (including deletions), `pullOnce` silently returns `up-to-date` and defers the pull. Webhook-triggered pulls are dropped without error. Run `git status` and commit or stash any pending changes if pulls aren't landing.

## File Constraints

| Type | Limit |
|------|-------|
| TypeScript source files | 400 lines max |
| AI files (instructions, prompts, skills) | 600 words max |

## Security

- **Never commit `GITHUB_APP_PRIVATE_KEY` or any token** — load from `.env` (gitignored)
- Mask credentials when confirming: `${VAR:0:8}...`

## Workflow

- **Conventional Commits** — `type(scope): message`
- **Branch + PR** — never commit to `main` directly
- Load `branch-and-pr` skill before starting any feature work
- Load `commit-work` skill before making commits

## Browser Tooling

Default to `agent-browser` for all frontend work. Load the `agent-browser` skill; notes in `.github/skills/agent-browser/references/awesome-markdown-notes.md`. Its narrow viewport truncates the kanban board — avoid for layout debugging.
