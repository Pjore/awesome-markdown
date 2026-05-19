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

Pre-built images publish to GHCR on every push to `main` — no local build needed.

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

### Running kanban-ui with OIDC authentication

kanban-ui supports optional PKCE authentication via any OIDC provider (Zitadel,
Keycloak, Auth0, …). Auth is **disabled by default** — the app works without
credentials when both variables below are absent.

**1. Set environment variables in `apps/kanban-ui/.env`:**

```bash
VITE_ZITADEL_ISSUER=https://your-oidc-provider.example.com
VITE_CLIENT_ID=<client-id-from-your-oidc-provider>
```

`VITE_ZITADEL_ISSUER` must match the `issuer` field in the provider's discovery
document (`/.well-known/openid-configuration`).

**2. Register the redirect URI in your OIDC provider:**

```
http://localhost:5173/auth/callback   # dev
https://<your-domain>/auth/callback   # production
```

**3. Start the dev server:**

```bash
pnpm --filter kanban-ui dev
# open http://localhost:5173
```

The app shows a **sign in** gate when auth is enabled. After completing the OIDC
flow the user is redirected back to `/auth/callback`, tokens are exchanged, and
the boards page renders. A **sign out** button appears in the top bar.

| Screenshot | |
|---|---|
| Sign-in gate | [![Sign-in gate](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/auth-kanban-signin.png)](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/auth-kanban-signin.png) |
| Authenticated | [![Authenticated boards](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/auth-kanban-authenticated.png)](https://github.com/Pjore/awesome-markdown/releases/download/pr-screenshots/auth-kanban-authenticated.png) |

> **Zitadel-specific note:** if you are running Zitadel locally and testing from
> a browser on a different machine, ensure your OIDC app is configured as type
> **Web** with **Development Mode** enabled so that HTTP redirect URIs are
> accepted. See `docs/local-dev/debug-kanban-ui.md` in the cloud repo for a
> detailed walkthrough.

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
