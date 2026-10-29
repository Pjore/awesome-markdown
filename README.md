# awesome-markdown

[![CI](https://github.com/Pjore/awesome-markdown/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Pjore/awesome-markdown/actions/workflows/docker-publish.yml)
[![Stars](https://img.shields.io/github/stars/Pjore/awesome-markdown?style=flat)](https://github.com/Pjore/awesome-markdown/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/Pjore/awesome-markdown)](https://github.com/Pjore/awesome-markdown/commits/main)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker)](https://github.com/Pjore/awesome-markdown/pkgs/container/awesome-markdown)
[![Docs](https://img.shields.io/badge/docs-architecture-informational)](docs/ARCHITECTURE.md)

**awesome-markdown** is a lightweight, git-backed kanban system. Every card, board, and axis is a plain `.md` file in your own repository — no external database, no proprietary cloud.

[![Kanban board](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/kanban-simple.png)](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/kanban-simple.png)

<table>
<tr>
<td width="33%">

**Your boards at a glance**

[![Boards list](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/boards.png)](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/boards.png)

</td>
<td width="33%">

**Swimlanes for a second dimension**

[![Swimlane board](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/kanban-swimlanes.png)](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/kanban-swimlanes.png)

</td>
<td width="33%">

**Edit items in plain markdown**

[![Item editor](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/item.png)](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/item.png)

</td>
</tr>
</table>

---

## Quickstart

### Docker (recommended — no Node.js required)

```bash
mkdir -p content
docker compose up -d
# open http://localhost:5173 → Settings → FS (local)
```

> **macOS / Windows limitation:** files edited directly on the host are not picked up by the sync-engine when running in Docker. Changes made through the UI work correctly. See [#19](https://github.com/Pjore/awesome-markdown/issues/19) for details and planned fixes.

Point at an existing notes directory:

```bash
PROVIDER_FS_CONTENT_ROOT=/path/to/notes docker compose up -d
```

Release tags publish pre-built images to GHCR. Dokploy builds provider-fs and kanban-ui from the same checkout so their item protocol is deployed together; sync-engine remains image-based.

### Browser-only (no server)

```bash
git clone https://github.com/Pjore/awesome-markdown.git && cd awesome-markdown
pnpm install && pnpm --filter kanban-ui dev
# open http://localhost:5173 → Settings → localStorage
```

### Developer setup (pm2, hot-reload)

```bash
git clone https://github.com/Pjore/awesome-markdown.git && cd awesome-markdown
pnpm install
cp apps/provider-fs/.env.example apps/provider-fs/.env
cp apps/sync-engine/.env.example apps/sync-engine/.env
cp apps/kanban-ui/.env.example   apps/kanban-ui/.env
./scripts/services start
# open http://localhost:5173 → Settings → FS (local)
```

For remote git sync, set `SYNC_ENGINE_REMOTE_ENABLED=true` and supply GitHub App credentials in `apps/sync-engine/.env`.

---

## How it works

All data lives as `.md` files in `content/` with a YAML `entityType` field.

### Items

An `item` is a Markdown document with recursive frontmatter properties. Only `entityType`, `slug`, `createdAt`, and `updatedAt` are fixed, read-only metadata; other properties can contain text, numbers, booleans, null, mappings, and mixed lists. Items open in read mode with explicit **Edit / Save / Cancel**, plus YAML and full-Markdown recovery exports. A string `title` supplies the heading, otherwise `slug` is used.

Board filters select membership. Configure paths such as `boards.$board.column` or `boards.$board.axes.$axis.order` for board-/axis-scoped values. See [Item properties](docs/ITEM-PROPERTIES.md) for limits, editing, contextual selectors, and the revision-based persistence protocol.

```yaml
entityType: item
slug: fix-auth-bug
createdAt: "2026-01-01T00:00:00Z"
updatedAt: "2026-01-01T00:00:00Z"
title: Fix auth bug
repo: awesome-markdown
boards:
  - board: board-main
    column: todo
    order: "aP"
```

### Boards

A `board` projects the item pool through a candidate `filter`; `columns` and `swimlanes` reference reusable axis slugs. Candidates matching no column appear in `/homeless`. Define a filter as an object, or group several rules with `all`/`any`.

```yaml
entityType: board
slug: board-main
title: Main
createdAt: "2026-01-01T00:00:00Z"
updatedAt: "2026-01-01T00:00:00Z"
filter:
  property: boards.$board.board
  equals: board-main
columns: [todo, doing, done]
swimlanes: [awesome-markdown, agent-workspace]
```

### Axes & Filters

An `axis` defines one column or swimlane via a `filter` and `order`. The same axis can be a column on one board and a swimlane on another.

```yaml
entityType: axis
slug: todo
title: To do
filter:
  property: boards.$board.column
  equals: todo
order:
  by: boards.$board.order
  direction: asc
```

Filters using `equals` are **invertible** — a drop derives the required field changes. The cell combines the board rule with each axis's derived or explicit `writeOnDrop` rules. `$board` binds to the current board slug; `$axis` binds separately to each axis.

Repository rows use `filter: { property: repo, equals: <repo> }`. In a configured Home, `home board rows --repo agent-workspace --repo agentswarm --repo awesome-markdown-cloud` adds/reuses those swimlanes while preserving existing rows. See [Item properties](docs/ITEM-PROPERTIES.md) for complete definitions and editing/recovery workflows.

---

## Providers

| | localStorage | provider-fs + sync-engine |
|---|---|---|
| Server required | No | Yes |
| Git history | No | Yes — auto-commit on every write |
| Remote sync | No | GitHub push/pull |
| Best for | Demos, personal use | Teams, version-controlled tasks |

> **Security:** the SSE `/events` stream accepts an optional `?token=` query parameter. Avoid logging raw request URLs in production to prevent token exposure.

---

## Documentation & Contributing

- [Architecture](docs/ARCHITECTURE.md) · [Verification](docs/VERIFICATION.md) · [Item properties](docs/ITEM-PROPERTIES.md)
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE)
