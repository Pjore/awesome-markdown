# Architecture

## Getting started

New to the project? Start with the [README](../README.md) for setup and provider selection, then read [CONTRIBUTING.md](../CONTRIBUTING.md) for the development workflow and quality gate.

## System overview

awesome-markdown is a query-driven kanban system built around markdown files. The UI renders boards from a shared content pool, the filesystem provider persists items to disk, and the sync engine handles git-backed synchronization and live status events.

## Component diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         kanban-ui (SPA)                         │
│                                                                 │
│  BoardListPage ──► BoardPage ──► KanbanBoard (@dnd-kit)         │
│  ProviderContext (runtime-selectable)                           │
│  ConflictBanner ◄── SyncStore (SSE listener)                    │
└───────────┬──────────────────────────────┬──────────────────────┘
            │ PersistenceProvider HTTP      │ SSE /events
            ▼                              ▼
┌───────────────────────┐      ┌──────────────────────────────────┐
│  apps/provider-fs     │      │       apps/sync-engine           │
│  Fastify v5 :7701     │      │       Fastify v5 :7402           │
│  REST CRUD + SSE      │◄─────│  chokidar → simple-git → SSE    │
│  content/ (markdown)  │      │  remote pull/push (GitHub App)  │
└───────────────────────┘      └──────────────────────────────────┘
            │
            ▼
   content/
     {slug}.md   (entityType: item | board | axis)
```

## Packages and apps

- **`packages/contracts`** — shared Zod schemas and inferred TypeScript types.
- **`packages/filter-engine`** — shared filter evaluation, invertibility analysis, and drop mutation derivation.
- **`packages/provider-localstorage`** — browser-only provider for the zero-setup path.
- **`packages/provider-http`** — HTTP client used by the UI when talking to remote providers.
- **`apps/kanban-ui`** — React application with drag-and-drop board views.
- **`apps/provider-fs`** — Fastify sidecar that reads and writes markdown entities from disk.
- **`apps/sync-engine`** — watcher and git synchronization service that emits SSE updates.

## Domain model

All domain objects live in `content/` as markdown files with an `entityType` frontmatter field.

| entityType | Description |
|---|---|
| `item` | Card data, including the `boards[]` list and editable workflow fields |
| `board` | A board definition with an optional base filter and axis references |
| `axis` | Reusable ordered cells for columns or swimlanes |

Boards do not own items. They project the full item pool through filter rules. Each rendered cell is the combination of the board filter, column filter, and optional swimlane filter.

**Drop behavior:** when an item is dropped into a writable cell, the filter engine derives the smallest mutation set that satisfies that combined filter. Cells with non-invertible rules such as `or` or `any` stay read-only.

**Homeless behavior:** if an item references a board in `boards[]` but matches no column cell, it appears in that board's `/homeless` view.

## provider-fs endpoint reference

| Method | Path | Description |
|---|---|---|
| GET | `/boards` | List all board slugs and titles |
| GET | `/axes` | List all axis slugs and titles |
| GET | `/boards/:slug/render` | Return board cells, items, and invertibility flags |
| GET | `/boards/:slug/homeless` | Return items that match the board but no column |
| GET | `/items/:slug` | Fetch a single item |
| POST | `/items` | Create a new item |
| PATCH | `/items/:slug` | Update an item with one file write |
| DELETE | `/items/:slug` | Delete an item file |

## Data flow

### Local write path

1. A drag or edit in `kanban-ui` calls the active provider.
2. `provider-localstorage` updates in-memory browser state immediately, or `provider-http` sends a request to `provider-fs`.
3. `provider-fs` writes the markdown file in `content/`.
4. `sync-engine` sees the file change, creates a git commit, and emits an SSE `change` event.
5. The UI re-fetches the affected entity and refreshes the board.

### Remote change path

1. A remote push reaches GitHub.
2. A GitHub webhook or scheduled poll tells `sync-engine` to pull.
3. If the pull fast-forwards, the engine emits `change` events for each updated file.
4. The UI re-fetches data from `provider-fs`.

### Conflict path

1. `sync-engine` detects that a pull cannot fast-forward.
2. It records conflict metadata and emits a `conflict` event.
3. The UI shows a conflict banner and resolution options.
4. Resolving the conflict triggers the engine to finalize the merge and emit `synced`.

## Provider contract

The UI depends on a single `PersistenceProvider` interface from `@awesome-markdown/contracts`.

```
capabilities    { type: 'local' } | { type: 'http'; baseUrl: string }

CRUD groups     Board | Column | Swimlane | Item
  list*()       Promise<T[]>
  get*(id)      Promise<T | null>
  create*(data) Promise<T>
  update*(id,d) Promise<T>
  delete*(id)   Promise<void>

subscribe(handler: ProviderEventHandler): Unsubscribe
```

Both `provider-localstorage` and `provider-http` implement this contract, so the UI can switch providers at runtime.

## Sync events

| type | Key fields | Meaning |
|---|---|---|
| `change` | `path`, `paths[]`, `commitSha`, `source` | One or more files changed |
| `conflict` | `paths[]`, `diffHunks[]` | A merge conflict needs user action |
| `synced` | — | Remote sync succeeded or a conflict was resolved |
| `offline` | `reason` | Remote operations are currently failing |

Event schemas live in `packages/contracts/src/events.ts` and are validated on both emission and reception.
