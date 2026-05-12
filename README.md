# awesome-markdown

**awesome-markdown** is a lightweight, git-backed kanban system. Keep your tasks as plain markdown files in your own repository — no external database, no proprietary cloud. A pure client-side React UI talks directly to a pluggable persistence layer, while an independent sync-engine watches `content/`, auto-commits changes, and syncs with a GitHub remote in the background.

> **Zero-server quickstart:** run entirely in-browser using `provider-localstorage` — no sidecar process needed.  
> **Full git-backed setup:** pair `provider-fs` with `sync-engine` to persist cards as `.md` files and push them to GitHub automatically.

---

## Features

- **Plain markdown storage.** Every kanban card, board, and axis definition is a `.md` file with YAML frontmatter — human-readable, diff-friendly, and git-native.
- **No central API.** The UI talks directly to whichever persistence provider is active.
- **Two providers — pick the one you need:**
  - `provider-localstorage` — runs entirely in-browser, zero server setup. Great for personal use or demos.
  - `provider-fs` + `sync-engine` — persists to a local file tree, auto-commits, and push/pulls a GitHub remote.
- **Boards as queries.** All items live in a flat pool; boards project subsets of that pool through filter rules. No nested folders.
- **Conflict-aware sync.** When a git pull cannot fast-forward, the sync-engine emits a `conflict` event and the UI shows a resolution dialog.

---

## Quickstart

### Option A — Browser only (provider-localstorage, no server needed)

```bash
git clone https://github.com/Pjore/awesome-markdown.git
cd awesome-markdown
pnpm install
cp apps/kanban-ui/.env.example apps/kanban-ui/.env
pnpm --filter kanban-ui dev
# → open http://localhost:5173
# Select "localStorage" in the Settings panel
```

### Option B — Git-backed (provider-fs + sync-engine)

```bash
git clone https://github.com/Pjore/awesome-markdown.git
cd awesome-markdown
pnpm install

# Copy and fill in environment files
cp apps/provider-fs/.env.example  apps/provider-fs/.env
cp apps/sync-engine/.env.example  apps/sync-engine/.env
cp apps/kanban-ui/.env.example    apps/kanban-ui/.env

# Start all three services (UI on 5173, sidecar on 7701, sync on 7402)
./scripts/services start
# → open http://localhost:5173
# Select "FS (local)" in the Settings panel
```

For remote git sync, set `SYNC_ENGINE_REMOTE_ENABLED=true` and supply GitHub App credentials (`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`) in `apps/sync-engine/.env`. See `apps/sync-engine/.env.example` for the full reference. Set `SYNC_ENGINE_TARGET_BRANCH=<branch>` when working on a feature branch.

---

## Choosing a Provider

| | `provider-localstorage` | `provider-fs` + `sync-engine` |
|---|---|---|
| **Server required** | No | Yes (Node.js sidecar) |
| **Persistence** | Browser localStorage | Markdown files on disk |
| **Git history** | No | Yes — auto-commit on every write |
| **Remote sync** | No | Yes — push/pull to GitHub |
| **Multi-user / multi-device** | No | Yes (via git) |
| **Best for** | Demos, quick personal use | Team use, version-controlled tasks |

> **Security note for `provider-http` + remote endpoint:** the SSE `/events` stream accepts an optional `?token=` query-string parameter for authentication. Avoid logging raw request URLs in production — this would expose the bearer token in your access logs.

---

## Domain Model

**Flat pool, boards-as-queries.** All domain objects live as `.md` files in `content/` with a YAML frontmatter `entityType` field.

| entityType | Description |
|------------|-------------|
| `item` | A kanban card. Has a `boards[]` list of board slugs it belongs to. |
| `board` | Defines an optional base filter and references column + swimlane axis slugs. |
| `axis` | A named dimension (column or swimlane). Holds an ordered list of cells, each with a filter rule and optional `writeOnDrop` override. |

Boards don't own items — they **project** the item pool through filter rules. A board's cells are formed by the cross-product of column × swimlane axes.

**Drop semantics.** When the user drops an item into a cell, the filter engine derives the minimal field mutations from the cell's combined filter (board ∧ column ∧ swimlane). Each drop results in exactly one markdown file write. Cells whose combined filter uses non-invertible operators (e.g., `or`/`any`) are read-only.

**Homeless view.** Items whose `boards[]` list references a board but match no column cell appear in that board's `/homeless` view instead of the main grid.

---

## Monorepo Layout

```
packages/
  contracts/             Zod v4 schemas + TypeScript types (shared)
  filter-engine/         Isomorphic filter evaluate, invertibility analysis, mutation derivation
  provider-localstorage/ In-browser localStorage provider
  provider-http/         Fetch-based HTTP client implementing the provider interface
apps/
  kanban-ui/             React 19 + Vite 8 + Tailwind v4 SPA
  provider-fs/           Fastify v5 sidecar (port 7701 default)
  sync-engine/           Watcher + auto-commit + SSE server (port 7402 default)
```

---

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
| Tests | Vitest (unit/integration), browser automation (UI) |
| Lint / format | oxlint + Prettier |

---

## Prerequisites

**PM2 path (developers):**
- Node.js 22+
- pnpm 9+

**Docker Compose path (self-hosters / no Node required):**
- Docker Engine 24+ with the Compose plugin (`docker compose version` should succeed)

---

## Running Services

### Option A — PM2 (developer workflow, Node + pnpm required)

```bash
# Start all services
./scripts/services start

# Check status (name, PID, uptime, restarts, port)
./scripts/services status

# Stream logs for a service (Ctrl-C to stop)
./scripts/services logs ui
./scripts/services logs fs
./scripts/services logs sync

# Stop all services
./scripts/services stop
```

Services survive terminal close — PM2 keeps them running until explicitly stopped with `./scripts/services stop`.

---

### Option B — Docker Compose (self-hoster workflow, Docker only)

Run the full stack without installing Node, pnpm, or any development tooling.

#### Prerequisites

- Docker Engine 24+ with the Compose plugin. Verify with `docker compose version`.

#### 1. Copy and configure `.env` files

```bash
# Copy templates
cp apps/provider-fs/.env.example  apps/provider-fs/.env
cp apps/sync-engine/.env.example  apps/sync-engine/.env
cp apps/kanban-ui/.env.example    apps/kanban-ui/.env

# Edit apps/provider-fs/.env and set:
#   PROVIDER_FS_HOST=0.0.0.0          (required — 127.0.0.1 rejects container traffic)
#   PROVIDER_FS_CONTENT_ROOT=/content  (matches the container bind-mount path)

# Edit apps/sync-engine/.env and set:
#   SYNC_ENGINE_HOST=0.0.0.0           (required — 127.0.0.1 rejects container traffic)
#   SYNC_ENGINE_REPO_ROOT=/repo        (matches the container bind-mount path)

# Edit apps/kanban-ui/.env only if targeting a non-localhost host:
#   VITE_PROVIDER_FS_URL=http://<host>:7701
#   VITE_SYNC_ENGINE_URL=http://<host>:7402
# For a single-machine deployment the defaults (localhost) are fine — leave them commented out.
```

> **VITE_\* variables are baked into the bundle at build time.** If you need to
> point the UI at a remote host, update `apps/kanban-ui/.env` *before* running
> `docker compose build`. Changing the file after building has no effect.

#### 2. Ensure `content/` exists

Docker creates bind-mount directories as root if they are absent. Pre-create the
directory yourself to keep normal file ownership:

```bash
mkdir -p content
```

#### 3. Build and start

```bash
docker compose build
docker compose up -d
```

Or use the `scripts/compose` wrapper (mirrors `scripts/services` UX):

```bash
./scripts/compose start   # builds if needed, then starts detached
./scripts/compose status  # docker compose ps
./scripts/compose logs fs # stream provider-fs logs (Ctrl-C to stop)
./scripts/compose logs ui
./scripts/compose logs sync
./scripts/compose stop    # stop and remove containers
```

#### 4. Access the stack

| Service | URL |
|---------|-----|
| kanban-ui | <http://localhost:5173> |
| provider-fs API | <http://localhost:7701> |
| sync-engine SSE | <http://localhost:7402> |

#### PM2 vs Docker Compose — quick comparison

| | PM2 path | Docker Compose path |
|-|----------|---------------------|
| Requires Node + pnpm | ✅ Yes | ❌ No |
| Hot-reload / `dev` mode | ✅ Yes | ❌ No (production build) |
| Rebuilds on code change | manual | `docker compose build` |
| Isolation | processes | containers |
| Best for | active development | self-hosting, demos |

---

## Testing

```bash
pnpm typecheck && pnpm lint   # quality gate
pnpm test                     # all Vitest unit/integration suites
pnpm verify:ui                # UI smoke suite (requires running dev stack)
```

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — component diagram, data flow, conflict resolution flow
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — how to run tests and UI verification scenarios
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, branch conventions, PR process
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — community standards
- [`SECURITY.md`](SECURITY.md) — responsible disclosure policy

---

## Demo Content

The `content/` directory contains hand-authored markdown files that serve as living documentation for the domain model. Each file has a YAML frontmatter block with an `entityType` field (`item`, `board`, or `axis`). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details on the domain model.

---

## Contributing

Contributions are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow, branch naming, commit format, and PR checklist.

## License

[MIT](LICENSE)
