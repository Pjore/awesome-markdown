# kanban-ui

React 19 + Vite 8 + Tailwind v4 kanban board SPA for awesome-markdown.

## Dev Commands

| Command | Description |
|---------|-------------|
| `pnpm --filter kanban-ui dev` | Start dev server at `http://localhost:5173` |
| `pnpm --filter kanban-ui build` | Production bundle (output: `dist/`) |
| `pnpm --filter kanban-ui preview` | Serve the production bundle locally |
| `pnpm --filter kanban-ui typecheck` | TypeScript type check (`tsc --noEmit`) |

## Provider Selection

The UI supports two persistence backends, switchable at runtime via the **Settings panel**:

| Provider | Requires | Description |
|----------|----------|-------------|
| `localStorage` | Nothing — zero setup | Default; stores board data in the browser |
| `Local FS sidecar` | `provider-fs` running at a configurable URL | Persists items as markdown files; enables sync-engine |

To switch providers: open Settings, choose provider type, enter the sidecar URL (default `http://localhost:7701`), and confirm. The UI rebinds the provider and reloads board state without a page reload.

## Multi-board Routing

| Route | Description |
|-------|-------------|
| `/` | Board list — shows all boards |
| `/boards/:slug` | Opens a specific board by slug |

## SSE Sync Indicator

When connected to the FS provider, the UI connects to the sync-engine SSE stream (`http://localhost:7402/events`) and shows a sync status indicator:

- **Synced** — last push succeeded
- **Offline** — remote unreachable; local commits accumulating
- **Conflict** — diverged branches; resolution banner shown

## Seed Flag

Append `?seed=m3` to the dev server URL to load a deterministic board (2 swimlanes × 3 columns × 6 items):

```
http://localhost:5173/?seed=m3
```

Used by agent-browser scenarios to guarantee a known starting state.

## Agent-browser Scenarios

UI verification uses `agent-browser` — LLM-driven browser automation against the running dev server.

```
agent-browser/
  m3/   board render, DnD across columns and swimlanes, CRUD
  m5/   runtime provider switch via settings, SSE indicator updates
  m8/   conflict banner on conflict event, ours/theirs/open externally
  m9/   board list page, navigation, deep-link /boards/:slug
```

Per-milestone verification commands:

```bash
pnpm --filter kanban-ui verify:m3
pnpm --filter kanban-ui verify:m5
pnpm --filter kanban-ui verify:m8
pnpm --filter kanban-ui verify:m9
```

Aggregate smoke suite (all milestones in sequence):

```bash
pnpm verify:ui
```

See [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) for setup instructions.

## Tech Stack

| Layer | Tech |
|-------|------|
| UI framework | React 19 |
| Build | Vite 8 (Rolldown + Oxc) |
| Styles | Tailwind CSS v4 (CSS-first, `@import "tailwindcss"`) |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| Routing | react-router-dom v7 |
| Shared types | `@awesome-markdown/contracts` (Zod v4) |
| Default provider | `@awesome-markdown/provider-localstorage` |
| HTTP provider | `@awesome-markdown/provider-http` |
