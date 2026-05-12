# awesome-markdown — Scaling & Auth Preparation

## Purpose

This document captures the rationale, use cases, and decisions that affect the
**open-source `awesome-markdown` repository** as the project grows beyond a
single local instance. It covers package publishing, the minimal auth
preparation needed in `provider-http`, and the deployment model for
self-hosters. It deliberately excludes cloud-hosted or hosted-service concerns.

---

## Guiding Principles

- The existing self-hosted local-first stack (`provider-fs` + `sync-engine` +
  `provider-localstorage`) must remain **entirely unchanged** in behaviour.
- All scaling and auth changes are **additive** — no breaking changes to the
  `PersistenceProvider` contract or existing apps.
- The OSS boundary is generous: everything except the cloud-hosted backend
  lives in this repo and is publicly licensed.

---

## OSS Package Boundary

| Package / App | OSS | Notes |
|---|---|---|
| `packages/contracts` | ✅ | Shared Zod schemas and TypeScript types |
| `packages/filter-engine` | ✅ | Isomorphic filter evaluator, core project logic |
| `packages/provider-http` | ✅ | Browser fetch client for the `provider-fs` REST contract |
| `packages/provider-localstorage` | ✅ | Zero-server browser provider |
| `apps/provider-fs` | ✅ | Local filesystem sidecar |
| `apps/sync-engine` | ✅ | Local git watcher and remote sync |
| `apps/kanban-ui` | ✅ | React SPA — open UI maximises adoption |

The cloud backend is a separate private repository that **consumes** the
published OSS packages; it is not part of this monorepo.

---

## Package Publishing

### Rationale

External consumers (e.g. the private cloud backend, third-party integrations)
need to depend on `@awesome-markdown/contracts` and
`@awesome-markdown/filter-engine` without coupling to this monorepo's internal
workspace resolution. Git dependencies are brittle (no version pinning, rebuild
on every install, broken in many CI environments).

### Decision

Publish the following packages to the **public npm registry** under the
`@awesome-markdown` scope, on tagged releases:

- `@awesome-markdown/contracts`
- `@awesome-markdown/filter-engine`
- `@awesome-markdown/provider-http`
- `@awesome-markdown/provider-localstorage`

### Release workflow

A GitHub Actions workflow triggers on `v*.*.*` tags:

1. `pnpm typecheck && pnpm lint && pnpm test` — full quality gate
2. `pnpm publish --filter @awesome-markdown/contracts --access public`
3. `pnpm publish --filter @awesome-markdown/filter-engine --access public`
4. `pnpm publish --filter @awesome-markdown/provider-http --access public`
5. `pnpm publish --filter @awesome-markdown/provider-localstorage --access public`

Each package carries its own `version` field in `package.json`. Semantic
versioning applies; the `contracts` package version is the compatibility anchor
— a major bump signals a breaking schema change.

### Required `package.json` additions per published package

```jsonc
{
  "name": "@awesome-markdown/contracts",
  "version": "1.0.0",
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "files": ["dist"],
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }
}
```

Each package needs a `build` script (e.g. `tsc -p tsconfig.build.json`) that
emits `dist/` before publishing. The workspace symlinks are not included in the
published artifact.

---

## `provider-http` Auth Preparation

### Rationale

`provider-http` currently makes unauthenticated fetch calls to
`http://localhost:7701`. Self-hosters have no auth on `provider-fs` and this
is correct. However, when `provider-http` is pointed at a remote URL that
requires authentication (e.g. a cloud backend that validates JWTs), there is
no mechanism to attach a token.

### Decision

Add an optional `getToken?: () => Promise<string>` factory to
`createHttpProvider`. It is called before each request; if present the result
is attached as `Authorization: Bearer <token>`. If absent, behaviour is
identical to today.

```ts
// Self-hosted — unchanged behaviour
createHttpProvider({ baseUrl: 'http://localhost:7701' })

// Remote authenticated endpoint
createHttpProvider({
  baseUrl: 'https://api.example.com/repos/owner/name',
  getToken: () => authClient.getAccessToken(),
})
```

**Constraints:**
- The function signature of `createHttpProvider` gains one optional field —
  no existing call site breaks.
- `provider-http` remains auth-agnostic; it knows nothing about Zitadel,
  OAuth, or any specific auth system.
- Token refresh is the caller's responsibility; `provider-http` only calls
  `getToken()` once per request.
- The change touches one file (`packages/provider-http/src/client.ts` or
  equivalent) and its type definition.

---

## Deployment Model (Self-Hosted)

### Dual-mode strategy

Two orchestration tools coexist in the repo — each optimised for a different
audience. Neither replaces the other.

| | PM2 (`ecosystem.config.cjs`) | Docker Compose (`docker-compose.yml`) |
|---|---|---|
| **Audience** | Developers | Non-developers / server deployment |
| **Entry point** | `./scripts/services start` | `docker compose up` |
| **Prerequisite** | Node + pnpm installed | Docker only |
| **Log ergonomics** | `pm2 logs` — per-service colour, timestamps | `docker compose logs -f` |
| **Breakpoints** | Native — direct Node process, zero config | Remote attach — expose port `9229`, configure `launch.json` |
| **Hot reload** | Yes — via `tsx watch` / nodemon in each app | Requires watch-mode volume mount |
| **Adding infra** | Awkward | Natural — Postgres, Vault, Caddy as extra services |

### PM2 — developer workflow

`ecosystem.config.cjs` and `./scripts/services` remain the primary developer
interface. They are unchanged.

**Debugging with breakpoints:**

Add `--inspect` to the relevant app's `script` args in `ecosystem.config.cjs`:

```js
{ name: 'provider-fs', script: 'node --inspect=9229 dist/index.js', ... }
```

Then attach VS Code with a standard Node attach configuration — no extra setup
needed. Each service can be given a different port (`9229`, `9230`, `9231`).

### Docker Compose — distribution / non-dev deployment

Docker Compose is the packaging and deployment method for self-hosters who do
not have a Node/pnpm toolchain, and for running the stack on a home server or
VPS.

#### Compose service topology

```
services:
  kanban-ui       # Vite production build, port 5173
  provider-fs     # Fastify sidecar, port 7701
  sync-engine     # Git watcher + SSE, port 7402
```

All three services share a bind-mounted `content/` volume. `sync-engine` also
bind-mounts the git repo root for `simple-git` access.

A fourth `caddy` service can be added for HTTPS termination on a home server
or VPS without any code changes.

A parallel `./scripts/compose` wrapper mirrors the `./scripts/services` UX
(`start`, `stop`, `status`, `logs <service>`) for users who prefer the
abstraction.

### `.env` contract

Each service reads from its own `.env` file in both modes:
- PM2: loaded by `dotenv` at process start (existing behaviour)
- Compose: loaded via `env_file:` directive

No `.env` files are committed; each ships a `.env.example`.

---

## Local/Cloud Coexistence

When a user runs the local stack (`sync-engine` + `provider-fs`) alongside a
remote connection to the cloud backend, both write to the same GitHub branch.

- The sync-engine uses `simple-git push` (full commit).
- The cloud backend uses the GitHub Contents API with per-file SHA optimistic
  locking.
- Conflicts surface as HTTP 409 responses from the GitHub API and are resolved
  at the field level (structured frontmatter diff, not raw text hunks).

**Rule:** Running both simultaneously is supported but not recommended for the
same file at the same time. Document this in the README; do not enforce it in
code. The 409 retry path handles the rare race.

The local-only path (`provider-fs` with no remote sync) is completely unaffected
by any of the above.

---

## Non-Goals (Out of Scope for This Repo)

- Multi-tenant user management
- GitHub App platform integration (single App serving many users)
- Content caching backed by a hosted database
- Auth service deployment (Zitadel, etc.)
- Billing, usage limits, or access control beyond filesystem permissions
