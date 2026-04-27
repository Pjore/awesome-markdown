# Milestone Plan: M4 — local-fs provider sidecar

## 0. Metadata
- **Milestone:** 4 of 10
- **Complexity:** 4
- **Work:** 4
- **Estimated Files:** ~20 (source + tests + config)
- **Dependencies:** M1 (`packages/contracts` schemas, DTOs, error envelope, provider interface)

## 1. Objective
Ship `apps/provider-fs`, a Fastify v5 + Zod-typed Node sidecar that implements the `PersistenceProvider` HTTP contract against a markdown-on-disk store under `content/`, and emits local-write SSE events. External-change SSE remains M6's responsibility.

## 2. Constraints & Assumptions
- M1 already exports Zod v4 schemas for Item, Column, Swimlane, Board; HTTP route DTOs; SSE event union; and a uniform error envelope from `packages/contracts`.
- `awesome-markdown-content-tmp.md` defines the canonical markdown body + YAML frontmatter shape; this milestone treats that shape as authoritative for Items.
- Columns, Swimlanes, and Boards persist as YAML/JSON sidecar files under `content/` (no markdown body required); exact file layout decided in this plan, not in M1.
- The sidecar is **single-tenant**, single-process, and trusts loopback callers. No auth, no CORS hardening beyond permissive localhost defaults.
- File watching for **external** edits is explicitly out of scope; this sidecar only emits SSE for changes it itself performs (writes via its own routes).
- gray-matter is used for frontmatter parse/serialize; YAML dialect is gray-matter's default.
- Per-source-file ceiling: ≤400 lines.
- Out of scope: git operations, conflict detection, remote sync, multi-board switching UI, auth.

## 3. Deliverables (Definition of Done)
- [ ] `apps/provider-fs/` package created with `package.json`, `tsconfig.json`, build/dev/test scripts, and a Fastify v5 entrypoint.
- [ ] All `PersistenceProvider` HTTP routes implemented for Items, Columns, Swimlanes, Boards (list, get, create, update, delete).
- [ ] All routes use `fastify-type-provider-zod` with Zod schemas imported from `packages/contracts` for both request and response validation.
- [ ] Markdown filesystem repository module persists Items as `<slug>.md` files with YAML frontmatter matching the content schema baseline.
- [ ] Sidecar files for Columns, Swimlanes, Boards persisted under deterministic paths within `content/`.
- [ ] SSE endpoint streams `change` events for create/update/delete operations performed by this sidecar (local subscribe).
- [ ] Configurable `PORT`, `HOST`, and `CONTENT_ROOT` via env vars and CLI flags; precedence: CLI > env > defaults.
- [ ] Uniform error envelope (from contracts) returned for validation failures, not-found, and IO errors.
- [ ] Vitest suite under `apps/provider-fs/test/` covering routes, frontmatter shape, SSE local emission, and validation errors.
- [ ] `pnpm --filter provider-fs test` passes on a clean checkout with no network access.
- [ ] `apps/provider-fs/README.md` documents config flags, env vars, default port, and dev commands (full doc owned by M10).
- [ ] No source file exceeds 400 lines.

## 4. Step-by-Step Execution Plan

### Step 1: Scaffold the package
**Objective:** Create `apps/provider-fs` and wire it into the workspace.

**Files:**
- `apps/provider-fs/package.json` (create)
- `apps/provider-fs/tsconfig.json` (create)
- `apps/provider-fs/.gitignore` (create)
- `apps/provider-fs/README.md` (create, stub)

**Actions:**
1. Create `apps/provider-fs/package.json` with name `provider-fs`, type `module`, scripts: `dev`, `build`, `start`, `test`, `typecheck`.
2. Declare runtime deps: `fastify` v5, `fastify-type-provider-zod`, `@fastify/sensible`, `gray-matter`, `zod` v4, `@awesome-markdown/contracts` (workspace), and a CLI flag parser (e.g. `mri` or `node:util` parseArgs).
3. Declare dev deps: `vitest`, `@types/node`, `tsx` (or equivalent dev runner), `typescript`.
4. Extend `tsconfig.base.json` in `tsconfig.json`; set `outDir` to `dist/`, `rootDir` to `src/`, include `src/**/*` and `test/**/*`.
5. Stub `README.md` with placeholder sections: Overview, Config, Run, Test (full content owned by M10).
6. Confirm `pnpm-workspace.yaml` already covers `apps/*`; no edit if true.

**Rules:**
- Must use ESM (`"type": "module"`).
- Must depend on `@awesome-markdown/contracts` via the workspace protocol (`workspace:*`).
- Must not duplicate any schema already exported by contracts.

**Output:**
- A workable, installable package that resolves all imports.

---

### Step 2: Define configuration loader
**Objective:** Resolve port, host, and content root from CLI + env with defaults.

**Files:**
- `apps/provider-fs/src/config.ts` (create)

**Actions:**
1. Define a `Config` shape with `port` (number), `host` (string), `contentRoot` (absolute path).
2. Read CLI flags `--port`, `--host`, `--content-root`.
3. Read env vars `PROVIDER_FS_PORT`, `PROVIDER_FS_HOST`, `PROVIDER_FS_CONTENT_ROOT`.
4. Apply defaults: port `7701`, host `127.0.0.1`, content root `<cwd>/content`.
5. Resolve `contentRoot` to an absolute path; create the directory if missing on startup.
6. Export a `loadConfig()` function returning a validated `Config` (validate with a local Zod schema).

**Rules:**
- CLI flags must override env vars; env vars must override defaults.
- Must reject non-numeric ports and relative content roots that escape `cwd`.

**Output:**
- Deterministic config struct consumed by the server bootstrap and tests.

---

### Step 3: Filesystem layout & repository modules
**Objective:** Define on-disk layout and CRUD primitives per entity.

**Files:**
- `apps/provider-fs/src/fs/paths.ts` (create)
- `apps/provider-fs/src/fs/items-repo.ts` (create)
- `apps/provider-fs/src/fs/columns-repo.ts` (create)
- `apps/provider-fs/src/fs/swimlanes-repo.ts` (create)
- `apps/provider-fs/src/fs/boards-repo.ts` (create)
- `apps/provider-fs/src/fs/atomic-write.ts` (create)

**Actions:**
1. In `paths.ts`, define resolvers: `items` → `content/boards/<boardId>/items/<itemId>.md`; `columns` → `content/boards/<boardId>/columns.yaml`; `swimlanes` → `content/boards/<boardId>/swimlanes.yaml`; `boards` → `content/boards/<boardId>/board.yaml`.
2. In `atomic-write.ts`, implement write-temp-then-rename for crash-safe writes; expose `writeFileAtomic(path, contents)`.
3. In `items-repo.ts`, implement `list(boardId)`, `get(boardId, itemId)`, `create(item)`, `update(item)`, `delete(boardId, itemId)`. Use `gray-matter` to serialize/parse frontmatter; markdown body comes from a designated body field on the Item schema (flag in Open Questions if M1 did not name one).
4. In `columns-repo.ts`, `swimlanes-repo.ts`, `boards-repo.ts`, implement equivalent CRUD against their YAML files. Columns and swimlanes are stored as ordered arrays in a single file per board.
5. All repo functions must validate inputs/outputs against the contracts Zod schema before crossing the FS boundary.
6. All repo functions throw a typed `RepoError` with discriminants: `not_found`, `already_exists`, `validation_failed`, `io_error`.

**Rules:**
- Must never write outside `contentRoot` (path traversal guard on every write).
- Must preserve unknown frontmatter fields on update (read-modify-write).
- Must keep YAML field order stable across writes for diff-friendliness.

**Output:**
- Pure repository modules independent of HTTP, callable from tests directly.

---

### Step 4: Local event bus & SSE channel
**Objective:** Emit local-write events and stream them to subscribers.

**Files:**
- `apps/provider-fs/src/events/bus.ts` (create)
- `apps/provider-fs/src/routes/subscribe.ts` (create)

**Actions:**
1. In `bus.ts`, implement an in-process pub/sub with `publish(event)` and `subscribe(handler) → unsubscribe`. Event type comes from contracts' SSE event union (`change` variant for this milestone).
2. Each `change` event payload contains: entity kind (`item`/`column`/`swimlane`/`board`), entity id, board id, operation (`create`/`update`/`delete`), source (`local`), and ISO timestamp.
3. In `subscribe.ts`, register a Fastify route `GET /subscribe` that opens an SSE stream: sets `Content-Type: text/event-stream`, disables compression, sends a `retry` hint, and forwards every bus event as a named SSE message.
4. Stream must heartbeat every 15s with a comment line to keep proxies alive.
5. On client disconnect, the route must call the bus unsubscribe and clean up timers.

**Rules:**
- Must only emit for writes performed via this sidecar's own routes (local-only).
- Must not depend on chokidar or any file watcher.
- Must serialize events using the contracts SSE DTO schema.

**Output:**
- A working SSE endpoint that emits exactly when the sidecar mutates state.

---

### Step 5: HTTP routes per entity
**Objective:** Wire repo modules into Fastify routes with Zod validation and contract-typed handlers.

**Files:**
- `apps/provider-fs/src/routes/items.ts` (create)
- `apps/provider-fs/src/routes/columns.ts` (create)
- `apps/provider-fs/src/routes/swimlanes.ts` (create)
- `apps/provider-fs/src/routes/boards.ts` (create)
- `apps/provider-fs/src/routes/health.ts` (create)

**Actions:**
1. For each entity, register routes following REST conventions under `/boards/:boardId/...` (and `/boards` for the board collection itself):
   - `GET` collection → list
   - `GET` by id → fetch
   - `POST` collection → create
   - `PUT` (or `PATCH`) by id → update
   - `DELETE` by id → delete
2. Attach Zod schemas (from contracts) to `schema.params`, `schema.body`, `schema.response` on every route via `fastify-type-provider-zod`'s `ZodTypeProvider`.
3. After every successful mutation, publish the corresponding `change` event to the bus.
4. Map `RepoError` discriminants to HTTP statuses: `not_found` → 404, `already_exists` → 409, `validation_failed` → 422, `io_error` → 500.
5. Add `GET /health` returning `{ ok: true, version, contentRoot }` (no auth, for liveness checks).

**Rules:**
- Must reject unknown body fields (Zod `strict()` per contracts policy) and return the uniform error envelope.
- Must not bypass repo validation; routes are thin adapters.
- Must keep each route file ≤400 lines.

**Output:**
- Full HTTP surface implementing the M1 contract.

---

### Step 6: Server bootstrap & error plugin
**Objective:** Compose plugins, error handler, and start the server.

**Files:**
- `apps/provider-fs/src/server.ts` (create)
- `apps/provider-fs/src/plugins/error-envelope.ts` (create)
- `apps/provider-fs/src/index.ts` (create — CLI entrypoint)

**Actions:**
1. In `server.ts`, build a `createServer(config)` factory that returns a configured Fastify instance: registers the Zod type provider, the error-envelope plugin, all route plugins, and the SSE route. Export the factory for tests.
2. In `error-envelope.ts`, install a Fastify `setErrorHandler` that maps Zod validation errors and `RepoError` to the contracts error envelope. Mask 5xx internals (no stack in body).
3. In `index.ts`, call `loadConfig()`, build the server, and call `listen({ host, port })`. Wire `SIGINT`/`SIGTERM` to graceful shutdown that closes SSE clients first.
4. Log startup line including resolved port and content root.

**Rules:**
- Must export `createServer` for tests; must not start listening when imported.
- Must not log secrets (none expected, but reinforce policy).

**Output:**
- A runnable sidecar via `pnpm --filter provider-fs dev` and `... start`.

---

### Step 7: Vitest test suite
**Objective:** Cover routes, persistence, SSE, and validation per milestone verification spec.

**Files:**
- `apps/provider-fs/vitest.config.ts` (create)
- `apps/provider-fs/test/fixtures/temp-content.ts` (create)
- `apps/provider-fs/test/items.routes.test.ts` (create)
- `apps/provider-fs/test/columns.routes.test.ts` (create)
- `apps/provider-fs/test/swimlanes.routes.test.ts` (create)
- `apps/provider-fs/test/boards.routes.test.ts` (create)
- `apps/provider-fs/test/frontmatter.shape.test.ts` (create)
- `apps/provider-fs/test/subscribe.sse.test.ts` (create)
- `apps/provider-fs/test/validation.envelope.test.ts` (create)

**Actions:**
1. In `temp-content.ts`, expose helpers to allocate a per-test `contentRoot` under the OS temp dir, seed initial files, and tear down after each test.
2. For each entity, write a route test that uses `fastify.inject` to drive `create → read → update → delete → list` and asserts response payloads conform to contract schemas.
3. In `frontmatter.shape.test.ts`, create an item via the route, then read the resulting `.md` file from disk and assert: YAML frontmatter parses, every required field from the content schema baseline is present, nested structures (e.g. tags, custom fields) round-trip unchanged.
4. In `subscribe.sse.test.ts`, open the SSE endpoint via `fastify.inject` (streaming) or by listening on an ephemeral port; perform a write and assert a `change` event is received with the correct entity kind, id, and board id.
5. In `validation.envelope.test.ts`, send malformed payloads (wrong types, unknown fields, missing required) and assert the response matches the uniform error envelope schema with HTTP 400/422.
6. Ensure all tests are hermetic: no shared state, no network, no real git, no real user `content/`.

**Rules:**
- Must use `fastify.inject` for HTTP route assertions; must not spawn a child process.
- Must NOT use `agent-browser`; this is a non-UI milestone.
- Must clean up temp dirs in `afterEach`.

**Output:**
- Green `pnpm --filter provider-fs test` on a clean checkout.

---

### Step 8: README stub & dev commands
**Objective:** Minimal docs sufficient to run and test the sidecar; full docs land in M10.

**Files:**
- `apps/provider-fs/README.md` (modify)

**Actions:**
1. Document default port (`7701`) and how to override via CLI/env.
2. Document `pnpm --filter provider-fs dev`, `... start`, `... test`, `... typecheck`.
3. Link to `packages/contracts` for the schema reference.
4. Note that external-change SSE is provided by the sync-engine (M6), not this sidecar.

**Rules:**
- Must stay concise; defer architecture diagrams to M10.

**Output:**
- A README sufficient for a developer to run and verify the sidecar.

---

## 5. Data Model / Schema

This milestone consumes — does not redefine — the entity schemas owned by `packages/contracts` (M1). Storage layout decisions made here:

**On-disk layout (under `contentRoot`):**
- `boards/<boardId>/board.yaml` — single Board document.
- `boards/<boardId>/columns.yaml` — ordered array of Columns for that board.
- `boards/<boardId>/swimlanes.yaml` — ordered array of Swimlanes for that board.
- `boards/<boardId>/items/<itemId>.md` — one Item per file; YAML frontmatter + markdown body.

**Item file shape (per `awesome-markdown-content-tmp.md`):**
- Frontmatter fields: all Item scalar/object fields except the markdown body.
- Body: free-form markdown text bound to the Item's body field (name flagged in Open Questions if not yet fixed in M1).
- Unknown frontmatter fields are preserved verbatim on update.

**Indexes:** none on disk; list operations scan the relevant directory. Acceptable at MVP scale.

**Constraints:**
- Item id == filename stem; uniqueness enforced by filesystem.
- Board id == directory name under `boards/`.
- Column/Swimlane ids unique within their board's YAML array (validated on write).

## 6. Use Case Implementation

**Use Cases Covered (API surface only):**
- **UC-1** — Provides the HTTP CRUD that `kanban-ui` invokes when an item is dragged. The sidecar writes the markdown file and emits a local `change` event. Auto-commit and remote push are M6/M7.
- **UC-3** — Provides the read endpoints that `kanban-ui` re-fetches after the sync-engine notifies it of an external change. The external-change watcher and SSE emission for external edits live in M6.
- **UC-6** — Provides a stable, discoverable HTTP/SSE surface (with `GET /health`) so the UI can rebind to it at runtime. The selection UI and reconnection logic live in M5.

**Layer Responsibility:**
- Persist canonical state to the filesystem with the documented markdown shape.
- Validate every request and response against contract schemas.
- Emit `change` SSE events for **local** writes only.
- Surface a uniform error envelope for all failure modes.

**Interface Notes:**
- This plan assumes the contracts package exposes per-entity request/response DTOs, an SSE event DTO with a `source` discriminator distinguishing `local` vs `external` (the latter used by M6), and a uniform `ErrorEnvelope` schema. If any of these are missing in M1, see Open Questions.

## 7. Validation & Verification

**Verifier:** **Vitest** (`pnpm --filter provider-fs test`). `agent-browser` is **NOT** used in this milestone — this is a non-UI component, per AC-11 and Section 6a of the main plan.

**Coverage:**
- Per-entity round-trip tests (Items, Columns, Swimlanes, Boards) via `fastify.inject`: create → read → update → delete → list.
- Frontmatter shape test: written `.md` file matches the content schema baseline; nested fields preserved across update.
- SSE local-emission test: a sidecar-driven write produces a `change` event on `GET /subscribe` with correct payload.
- Validation envelope test: malformed payloads return the uniform `ErrorEnvelope` with appropriate 4xx status.
- Config test: CLI > env > defaults precedence; rejects invalid port and traversal paths.
- Atomic write test: simulated mid-write failure leaves prior file intact.

**Run:**
- `pnpm --filter provider-fs test` (milestone command).
- `pnpm --filter provider-fs typecheck` to confirm no `any` leakage from contracts.

**Out of verification scope (deferred):**
- External file-edit detection and SSE (M6).
- Git commit/push behavior (M6/M7).
- UI integration smoke (M5/M8 via `agent-browser`).

## 8. Rollback Strategy
- Entirely additive: new package `apps/provider-fs/` with no edits to other packages.
- Safe to revert by deleting the directory and any workspace lockfile entries it added.
- No data migration: the sidecar reads/writes files; if removed before any UI consumer exists, no on-disk state remains in production paths.
- If the contracts package needs adjustments to satisfy this milestone, those edits belong in a follow-up to M1, not this milestone; flag in Open Questions instead of editing.

## 9. Open Questions
- Does the M1 Item schema designate an explicit field for the markdown body (e.g. `body` / `description`), or is the body untyped? This plan assumes a single named body field; confirm with the contracts module.
- Does the M1 SSE event DTO carry a `source: 'local' | 'external'` discriminator? If not, M6 will need to extend it; this milestone emits `local` only and assumes the field exists.
- Does the M1 contract specify `PUT` or `PATCH` for partial updates? This plan assumes full-document `PUT` for simplicity; switch trivially if contracts say otherwise.
- Filename strategy for items: `<itemId>.md` (stable id) vs `<slug>.md` (human-readable). Plan picks id-based filenames to avoid rename churn on title edits; revisit if the content baseline mandates slug-based.
- Should `contentRoot` be auto-created if missing, or fail fast? Plan assumes auto-create at startup.
- Default port: chosen as `7701` to avoid common dev-server collisions; confirm no conflict with other milestones (M5 client, M6 sync-engine).

## 10. References
- Fastify v5 — https://fastify.dev/docs/latest/
- `fastify-type-provider-zod` — https://github.com/turkerdev/fastify-type-provider-zod
- gray-matter — https://github.com/jonschlinkert/gray-matter
- Zod v4 — https://zod.dev/
- Vitest — https://vitest.dev/
- Fastify testing with `inject` — https://fastify.dev/docs/latest/Guides/Testing/
- SSE on MDN — https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- pnpm workspace filtering — https://pnpm.io/filtering
- Main plan — `ai-docs/awesome-markdown-main.md`
