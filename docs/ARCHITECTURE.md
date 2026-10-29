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
- **`packages/core`** — backend-agnostic board render/homeless computation, `applyMutations`, and markdown entity (de)serialization; `provider-fs` delegates to it so other backends render identically.
- **`packages/provider-localstorage`** — browser-only provider for the zero-setup path.
- **`packages/provider-http`** — HTTP client used by the UI when talking to remote providers.
- **`packages/board-ui`** — the board surface (board list, board, item editor, drag-and-drop, conflict UI, design tokens) as a router-agnostic React library; hosts plug in routing via a `RouterAdapter`.
- **`apps/kanban-ui`** — thin React shell (router, top bar, provider settings) that mounts `board-ui`.
- **`apps/provider-fs`** — Fastify sidecar that reads and writes markdown entities from disk.
- **`apps/sync-engine`** — watcher and git synchronization service that emits SSE updates.

## Domain model

All domain objects live in `content/` as markdown files with an `entityType` frontmatter field.

| entityType | Description |
|---|---|
| `item` | Markdown document, fixed root identity/timestamps and recursive editable properties |
| `board` | A board definition with an optional base filter and axis references |
| `axis` | Reusable ordered cells for columns or swimlanes |

Boards project the item pool through filter objects. A leaf names a property and operator; `all`, `any` and `not` compose rules. Each cell combines the board candidate filter with separately bound column/swimlane expressions. `$board` selects a group by board identity, and `$axis` by the current axis identity.

**Drop behavior:** writable placement derives from the board rule and each dimension's derived or explicit writes. One drop applies one revision-checked atomic item batch. Same-cell reordering writes the selected configured ascending string target. Column ordering takes precedence over swimlane ordering, with `updatedAt` descending as fallback/tiebreak.

**Homeless behavior:** board-filter candidates matching no column appear in `/homeless`.

**Editing:** read-first item pages place Markdown beneath the heading, display typed recursive properties and separate system metadata, and use one explicit Save/Cancel session. Recovery exports include YAML properties or the full Markdown draft. [Authoring and item guide](ITEM-PROPERTIES.md).

## provider-fs endpoint reference

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Installed provider version and item protocol |
| GET | `/boards` | Board definitions |
| POST / PATCH / DELETE | `/boards`, `/boards/:slug` | Create/update/remove board definitions |
| GET | `/axes` | Axis definitions |
| POST / PATCH / DELETE | `/axes`, `/axes/:slug` | Create/update/remove axis definitions |
| GET | `/boards/:slug/render` | Return board cells, items, and invertibility flags |
| GET | `/boards/:slug/homeless` | Return items that match the board but no column |
| GET | `/items/:slug` | Authoritative `{ item, revision }` |
| POST | `/items` | Create and return `{ item, revision }` |
| PATCH | `/items/:slug` | Validate/commit `{ revision, mutations }`; return the saved record |
| DELETE | `/items/:slug` | Delete an item file |

## Data flow

### Local write path

1. The item editor captures a draft; board actions derive a mutation batch for the visible source.
2. The active provider checks the source revision, applies mutations to a clone and validates the complete item.
3. localStorage commits its store, or provider-fs atomically writes Markdown under the configured content root.
4. Index/events update after commit; the filesystem sync engine can create a git commit and emit synchronization events.
5. Read views refresh from authoritative data. An active edit snapshot remains available for Save, Cancel and conflict recovery.

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

```text
capabilities: { type: 'local' } | { type: 'http'; baseUrl: string }

Boards: listBoards / getBoard / createBoard / patchBoard
Axes:   listAxes / getAxis / createAxis / patchAxis
Views:  getBoardRender / getHomeless
Items:  getItem / createItem / patchItem -> { item, revision }
        deleteItem

subscribe(handler: ProviderEventHandler): Unsubscribe
```

Root item identity/timestamps are protected. Other properties use shared recursive validation and UTF-8/depth/value bounds. Revisions stay outside item frontmatter. Both providers use shared mutation/render rules; HTTP/filesystem persistence checks actual disk content under a per-item lock.

A configured Home uses its declared board Extension for OAuth, queries, journaled writes, snapshots and configuration operations. `home board rows --repo REPO` adds/reuses repository swimlanes through that selected service. The extension watcher emits task references for Home-owned Paths.

Both `provider-localstorage` and `provider-http` implement this contract, so the UI can switch providers at runtime.

## Sync events

| type | Key fields | Meaning |
|---|---|---|
| `change` | `path`, optional `entityId`, `paths[]`, `commitSha`, `source` | One or more files/entities changed |
| `conflict` | `paths[]`, `diffHunks[]` | A merge conflict needs user action |
| `synced` | — | Remote sync succeeded or a conflict was resolved |
| `offline` | `reason` | Remote operations are currently failing |

Event schemas live in `packages/contracts/src/events.ts` and are validated on both emission and reception.
