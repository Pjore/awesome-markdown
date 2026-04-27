# provider-fs

Fastify v5 sidecar that implements the `PersistenceProvider` HTTP contract, persisting kanban items as markdown files with YAML frontmatter.

## Dev Commands

```bash
pnpm --filter provider-fs dev        # run with tsx (hot-reload)
pnpm --filter provider-fs start      # run compiled output (after build)
pnpm --filter provider-fs build      # tsc --build
pnpm --filter provider-fs test       # vitest suite
pnpm --filter provider-fs typecheck  # tsc --build
```

## Configuration

Configuration is resolved in priority order: CLI flags > environment variables > built-in defaults.

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--port` / `-p` | `PROVIDER_FS_PORT` | `7701` | TCP port to listen on |
| `--host` / `-h` | `PROVIDER_FS_HOST` | `127.0.0.1` | Bind address |
| `--content-root` / `-c` | `PROVIDER_FS_CONTENT_ROOT` | `<cwd>/content` | Absolute path to content directory |

Example:

```bash
PROVIDER_FS_CONTENT_ROOT=/path/to/repo/content pnpm --filter provider-fs dev
```

## HTTP API

All routes are prefixed by resource type. Schemas are defined in `packages/contracts`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards` | List all boards |
| POST | `/boards` | Create a board |
| GET | `/boards/:id` | Get a board |
| PATCH | `/boards/:id` | Update a board |
| DELETE | `/boards/:id` | Delete a board |
| | `/boards/:id/columns/*` | Column CRUD |
| | `/boards/:id/swimlanes/*` | Swimlane CRUD |
| | `/boards/:id/items/*` | Item CRUD |
| GET | `/subscribe` | SSE stream of local `change` events |

External-change SSE (from git pulls) is provided by the sync-engine, not this sidecar.

## Content Directory Structure

```
content/
  boards/
    {boardId}/
      board.yaml        board metadata (id, slug, title, description, timestamps)
      columns.yaml      array of column objects
      swimlanes.yaml    array of swimlane objects
      items/
        {itemId}.md     markdown body + YAML frontmatter (all item fields)
```

Each `{itemId}.md` uses gray-matter frontmatter. Example:

```
---
id: item-abc
boardId: board-xyz
columnId: col-1
swimlaneId: lane-1
title: Fix login bug
status: in_progress
priority: high
tags: [backend, auth]
createdAt: 2025-01-01T00:00:00.000Z
updatedAt: 2025-01-02T12:00:00.000Z
---
Detailed description goes here.
```

## Notes

- Writes use atomic temp-file + rename to avoid partial reads by the sync-engine.
- Schema reference: `packages/contracts/src/schemas/` and `packages/contracts/src/dtos.ts`.
- For the full system architecture, see [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).
