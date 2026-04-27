# Architecture

## Component Diagram

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
│  content/ (markdown)  │      │  remote pull/push (GITHUB_TOKEN) │
└───────────────────────┘      └──────────────────────────────────┘
            │
            ▼
   content/boards/{id}/
     board.yaml
     columns.yaml
     swimlanes.yaml
     items/{itemId}.md
```

**packages/contracts** is consumed by every component. It is never a runtime service.

**packages/provider-localstorage** runs entirely in-browser — no server needed for the zero-setup path.

**packages/provider-http** is the fetch-based client that wraps the provider-fs REST API, loaded in kanban-ui when the user selects the FS provider.

---

## Data Flow — Normal Write (UC-1)

1. User drags a card → `@dnd-kit` fires `onDragEnd`
2. `BoardPage` calls `provider.updateItem(id, patch)`
3. If localStorage provider: in-memory update + `subscribe` callback fires → re-render.
4. If HTTP provider: `PATCH /boards/:bid/items/:id` → provider-fs writes `{itemId}.md`
5. chokidar in sync-engine detects the write → debounce window expires → `simple-git add/commit`
6. sync-engine emits `change` SSE event → kanban-ui `SyncStore` receives it
7. `SyncStore` dispatches re-fetch of the affected entity → board re-renders

---

## Data Flow — Remote Change (UC-4)

1. sync-engine periodic `git pull` (every 30 s by default)
2. Fast-forward succeeds → sync-engine emits one `change` event per modified file
3. kanban-ui re-fetches affected entities from provider-fs

**Conflict path:**

1. Pull cannot fast-forward → `conflict-detector` records conflict state
2. sync-engine emits `conflict` event: `{ paths[], diffHunks[] }`
3. kanban-ui `SyncStore` stores conflict → `ConflictBanner` appears
4. User picks **Ours**, **Theirs**, or **Open externally**
5. `POST /conflict/resolve` to sync-engine → merge finalised, commit created
6. sync-engine emits `synced` → banner dismissed

---

## Offline Tolerance (UC-2)

- Writes always go through provider-fs to disk; sync-engine is not in the write path.
- When sync-engine is offline: commits accumulate locally.
- On reconnect: pending commits push to remote → `synced` emitted.
- When push/pull fails: exponential back-off (1 s → 60 s); after 2 consecutive failures → `offline` event.

---

## Provider Contract

`PersistenceProvider` (TypeScript interface in `packages/contracts`) is the single abstraction the UI depends on:

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

`ProviderEvent` is `{ type: 'change'; entityType; entityId }`.

Both implementations (`provider-localstorage`, `provider-http`) satisfy this interface. Runtime selection via the Settings panel swaps the active implementation without a page reload.

---

## SSE Event Union (`SyncEvent`)

| type | Key fields | Meaning |
|------|-----------|---------|
| `change` | `path`, `paths[]`, `commitSha`, `source` | File(s) committed |
| `conflict` | `paths[]`, `diffHunks[]` | Diverged branches — needs resolution |
| `synced` | — | Remote push succeeded / conflict cleared |
| `offline` | `reason` | Remote unreachable (push/pull failed) |

All shapes are defined in `packages/contracts/src/events.ts` and validated with Zod at both emission and reception.
