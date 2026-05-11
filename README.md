# awesome-markdown

Lightweight, git-backed kanban system. Pure client-side React UI with pluggable persistence providers and an independent sync-engine for git and external-change notifications.

## Domain Model

**Flat pool, boards-as-queries.** All domain objects live as `.md` files in `content/` with a YAML frontmatter `entityType` field. There is no directory nesting per board.

| entityType | Description |
|------------|-------------|
| `item` | A kanban card. Has a `boards[]` list of board slugs it belongs to. |
| `board` | Defines an optional base filter and references column + swimlane axis slugs. |
| `axis` | A named dimension (column or swimlane). Holds an ordered list of cells, each with a filter rule and optional `writeOnDrop` override. |

Boards don't own items — they **project** the item pool through filter rules. A board's cells are formed by the cross-product of column × swimlane axes.

**Drop semantics.** When the user drops an item into a cell, the filter engine derives the minimal field mutations from the cell's combined filter (board ∧ column ∧ swimlane). Each drop results in exactly one markdown file write. Cells whose combined filter uses non-invertible operators (e.g., `or`/`any`) are read-only.

**Homeless view.** Items whose `boards[]` list references a board but match no column cell appear in that board's `/homeless` view instead of the main grid.

## Overview

- **No central API.** The UI talks directly to whichever persistence provider is selected at runtime.
- **Two providers.** `provider-localstorage` runs entirely in-browser — zero server required. `provider-fs` is a local Fastify sidecar that serves the flat content pool via REST.
- **Isomorphic filter engine.** `packages/filter-engine` evaluates cell filters, analyses invertibility, and derives drop mutations — shared between UI and sidecar.
- **Independent sync-engine.** A separate process watches `content/`, auto-commits, push/pulls a GitHub remote, and broadcasts SSE events to the UI.
- **Conflict-aware.** When a git pull cannot fast-forward, the sync-engine emits a `conflict` event and the UI shows a resolution dialog.

## Monorepo Layout

```
packages/
  contracts/            Zod v4 schemas + TypeScript types (shared)
  filter-engine/        Isomorphic filter evaluate, invertibility analysis, mutation derivation
  provider-localstorage/ In-browser localStorage provider
  provider-http/         Fetch-based HTTP client implementing the provider interface
apps/
  kanban-ui/            React 19 + Vite 8 + Tailwind v4 SPA
  provider-fs/          Fastify v5 sidecar (port 7701 default)
  sync-engine/          Watcher + auto-commit + SSE server (port 7402 default)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | React 19, Vite 8 (Rolldown + Oxc), Tailwind v4, @dnd-kit |
| API / sidecar | Fastify v5 + `fastify-type-provider-zod` |
| Validation | Zod v4 — import from `"zod"` |
| Git | simple-git + GitHub App tokens (`@octokit/auth-app`) |
| File watching | chokidar |
| Markdown frontmatter | gray-matter |
| Live channel | Native SSE (no WebSocket) |
| Monorepo | pnpm workspaces (no Turborepo) |
| Tests | Vitest (non-UI), agent-browser (UI) |
| Lint / format | oxlint + Prettier |

## Prerequisites

- Node.js 22+
- pnpm 9+

## Setup

```bash
pnpm install

# Copy env templates and fill in your local values
cp apps/provider-fs/.env.example apps/provider-fs/.env
cp apps/sync-engine/.env.example apps/sync-engine/.env
cp apps/kanban-ui/.env.example   apps/kanban-ui/.env

pnpm typecheck && pnpm lint   # quality gates — must pass before committing
```

## Running Services

All three services are managed via a PM2-backed CLI wrapper:

```bash
# Start all services (ui on 5173, provider-fs on 7701, sync-engine on 7402)
./scripts/services start

# Check status (name, PID, uptime, restarts, port, owning worktree)
./scripts/services status

# Stream logs for a service (Ctrl-C to stop)
./scripts/services logs ui
./scripts/services logs fs
./scripts/services logs sync

# Get last 50 lines and exit (agent-friendly)
./scripts/services logs ui --lines 50 --nostream

# Stop all services
./scripts/services stop

# Switch services to another worktree (stops current, restarts from target path)
./scripts/services switch /path/to/other-worktree
```

Services survive terminal/agent-session close — PM2 keeps them running until explicitly stopped with `./scripts/services stop`.

VS Code tasks are also available (Ctrl+Shift+P → "Tasks: Run Task"):
- **Services: Start All** / **Services: Stop All** / **Services: Status**
- **Services: Tail UI Log** / **Services: Tail FS Log** / **Services: Tail Sync Log**

For remote git sync, set `SYNC_ENGINE_REMOTE_ENABLED=true` and the GitHub App credentials (`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`) in `apps/sync-engine/.env` before starting. See `apps/sync-engine/.env.example` for the full reference. When working on a feature branch, also set `SYNC_ENGINE_TARGET_BRANCH=<branch>` so the engine syncs the right branch.

> **Underlying commands** (used by the services wrapper internally):
> ```bash
> pnpm --filter kanban-ui dev          # UI dev server → http://localhost:5173
> pnpm --filter provider-fs dev        # FS sidecar   → http://localhost:7701
> SYNC_ENGINE_REPO_ROOT=$(pwd) pnpm --filter sync-engine dev  # Sync → http://localhost:7402
> ```

## Demo Content

The `content/` directory contains hand-authored markdown files that serve as
**living documentation** for the domain model. Each file has a YAML frontmatter
block with an `entityType` field (`item`, `board`, or `axis`).

| File | Type | Purpose |
|------|------|---------|
| `content/board-dev.md` | board | Scoped board (B.filter: `project = dev`); columns by priority + tag |
| `content/board-all.md` | board | Unfiltered board; columns by status, swimlane by priority |
| `content/priority-high.md` | axis | **Reused axis** — column on `board-dev`, swimlane on `board-all` |
| `content/status-todo.md` | axis | Status bucket; invertible `equals` filter |
| `content/status-doing.md` | axis | Status bucket; invertible `equals` filter |
| `content/status-done.md` | axis | **Non-invertible** `any` OR filter → read-only cells |
| `content/tag-urgent.md` | axis | Explicit `writeOnDrop` override (appends tag + sets priority) |
| `content/item-fix-auth-bug.md` | item | Has `boards[]` entries for both boards; tagged urgent |
| `content/item-refactor-db.md` | item | `status: done` → lands in read-only cell on `board-dev` |
| `content/item-onboard-ml.md` | item | **No `boards[]` entry** — floats in the item pool |

Key patterns demonstrated:

- **Axis reuse across boards** (`priority-high`): the same axis slug drives a
  column on one board and a swimlane on another.
- **Non-invertible (read-only) cell** (`status-done`): an `any` OR filter can
  never be uniquely inverted, so every cell at that axis is read-only.
- **`writeOnDrop` override** (`tag-urgent`): explicit mutation list overrides
  the filter-derived mutations, setting both the tag and priority on drop.
- **Floating item** (`item-onboard-ml`): an item with no `boards[]` entry
  exercises the homeless view.

## Testing

```bash
pnpm test                                        # all Vitest suites
pnpm --filter @awesome-markdown/provider-localstorage test
pnpm --filter provider-fs test
pnpm --filter sync-engine test
pnpm verify:ui                                   # aggregate agent-browser UI smoke suite
```

## Architecture & Verification

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — component diagram, data flow, conflict flow
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — how to run tests and agent-browser scenarios

## File Constraints

| Type | Limit |
|------|-------|
| TypeScript source files | 400 lines max |
| AI / instruction files | 600 words max |

## Planning

Implementation plan: [`ai-docs/awesome-markdown-main.md`](ai-docs/awesome-markdown-main.md).
