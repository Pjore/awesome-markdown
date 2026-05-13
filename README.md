# awesome-markdown

**awesome-markdown** is a lightweight, git-backed kanban system. Every card, board, and axis is a plain `.md` file in your own repository — no external database, no proprietary cloud.

---

## Quickstart

### Docker (recommended — no Node.js required)

```bash
mkdir -p content
docker compose up -d
# open http://localhost:5173 → Settings → FS (local)
```

Point at an existing notes directory:

```bash
PROVIDER_FS_CONTENT_ROOT=/path/to/notes docker compose up -d
```

Pre-built images publish to GHCR on every push to `main` — no local build needed.

### Browser-only (no server)

```bash
git clone https://github.com/Pjore/awesome-markdown.git && cd awesome-markdown
pnpm install && pnpm --filter kanban-ui dev
# open http://localhost:5173 → Settings → localStorage
```

---

## How it works

All data lives as `.md` files in `content/` with a YAML `entityType` field.

### Items

An `item` is a kanban card. Fields live in frontmatter: `title`, `status`, `tags`, custom properties, and a `boards[]` array. Each board entry carries an `order` key for independent sort position per board.

```yaml
entityType: item
title: Fix auth bug
status: doing
boards:
  - board: board-dev
    order: c0V
```

### Boards

A `board` is a query, not a folder. An optional `filter` scopes the candidate set; `columns` and `swimlanes` reference axis slugs. Items matching no column appear in `/homeless` rather than being lost.

```yaml
entityType: board
filter:
  property: project
  equals: dev
columns: [priority-high, tag-urgent]
swimlanes: [status-todo, status-doing, status-done]
```

### Axes & Filters

An `axis` defines one column or swimlane via a `filter` and `order`. The same axis can be a column on one board and a swimlane on another.

```yaml
entityType: axis
filter:
  property: status
  equals: todo
order:
  by: boards.$board.order
  direction: asc
```

Filters using `equals` are **invertible** — dropping a card onto the cell writes the minimal field change to the file. Filters using `or` / `any` produce read-only cells.

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

- [Architecture](docs/ARCHITECTURE.md) · [Verification](docs/VERIFICATION.md)
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE)
