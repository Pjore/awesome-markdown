# Milestone Plan: Sync-engine — file watch + auto-commit + SSE

## 0. Metadata
- **Milestone:** 6 of 10
- **Complexity:** 4
- **Work:** 3
- **Estimated Files:** ~16 (app scaffold, watcher, committer, SSE hub, config, tests, fixtures, README)
- **Dependencies:** M1 (shared contracts: event union, schemas), M4 (local-fs provider sidecar — defines the `content/` layout this engine watches; sidecar is the canonical "self-authored" writer)

## 1. Objective
Stand up the `apps/sync-engine/` Node + Fastify v5 service that watches the
`content/` directory, debounces filesystem changes into atomic local git
commits, and broadcasts `change` / `synced` / `offline` events over SSE per
the contract in `packages/contracts`. Remote pull/push is **out of scope**
(deferred to M7); this milestone owns local watching, local committing, and
the SSE transport only.

## 2. Constraints & Assumptions
- Runtime: Node.js (LTS, matches monorepo `engines`), TypeScript strict, ESM.
- HTTP framework: Fastify v5 (matches sidecar). SSE delivered via Fastify
  reply streaming (no extra WebSocket dependency).
- Watcher: `chokidar` (v4). Git: `simple-git`.
- Repo under watch is assumed to already be a git repo with at least one
  commit and a configured working tree; `content/` lives at a configurable
  path inside that repo. Initialization of the repo is not this milestone's
  responsibility.
- "Self-authored vs external" detection is **best-effort**: a short debounce
  window combined with an in-process marker (paths the sidecar announced via
  a lightweight hint mechanism, or by recent self-write timestamps if such a
  channel is added later) classifies writes. When uncertain, treat as
  external. Both classes are committed; both produce `change` events. The
  classification only affects commit message metadata, not behavior.
- Remote operations (`git pull`, `git push`, conflict emission) are **not**
  implemented here. The `synced` event in this milestone signals "local
  commit completed"; M7 redefines/augments it to include remote sync.
- `offline` event is emitted only for local infrastructure failures within
  scope (e.g. git command failure, watcher restart). Network-offline
  semantics are M7.
- No authentication on the SSE endpoint; service binds to localhost by
  default.
- Out of scope: remote git auth, conflict resolution, merge logic, webhook
  triggers, cross-platform service installers.

## 3. Deliverables (Definition of Done)
- [ ] New workspace package `apps/sync-engine/` registered in the pnpm
      workspace and root `tsconfig` references.
- [ ] Fastify v5 server boots on a configurable port and exposes:
      `GET /events` (SSE), `GET /health` (liveness), `GET /status`
      (current watcher + last-commit summary).
- [ ] Chokidar watcher observes the configured `content/` root, ignores
      `.git/` and dotfiles, and survives transient FS errors via auto-restart.
- [ ] Debouncer batches rapid file events (default 750 ms quiet window,
      configurable) into a single commit unit.
- [ ] simple-git committer stages changed paths, writes a commit with a
      structured message including author, source classification
      (self/external/mixed), and the affected relative paths, and reports
      the resulting SHA.
- [ ] SSE hub broadcasts events conforming to the
      `packages/contracts` event union: `change` (per batch, with paths and
      commit SHA), `synced` (after successful local commit), `offline` (on
      git/watcher failure with reason).
- [ ] Configuration loader reads from env vars and an optional config file:
      `repoRoot`, `contentDir`, `commitAuthorName`, `commitAuthorEmail`,
      `debounceMs`, `port`, `host`.
- [ ] Vitest suite under `apps/sync-engine/test/` exercising the scenarios
      in §7 against a real temp git repo fixture. All tests pass via
      `pnpm --filter sync-engine test`.
- [ ] `apps/sync-engine/README.md` describing config, run, SSE channel
      shape, and operational notes (referenced by main plan §"Documentation").
- [ ] No `any` types; all SSE payloads imported from `packages/contracts`.

## 4. Step-by-Step Execution Plan

### Step 1: Scaffold the workspace package
**Objective:** Add `apps/sync-engine/` as a buildable, testable workspace member.

**Files:**
- `apps/sync-engine/package.json` (create)
- `apps/sync-engine/tsconfig.json` (create)
- `apps/sync-engine/vitest.config.ts` (create)
- `apps/sync-engine/src/index.ts` (create — entry stub)
- `apps/sync-engine/README.md` (create — placeholder)
- `pnpm-workspace.yaml` (modify if needed to include `apps/*`)
- Root `tsconfig.json` / `tsconfig.base.json` (modify to add project reference)

**Actions:**
1. Create `package.json` with name `sync-engine`, private, type `module`,
   scripts: `dev`, `build`, `start`, `test`, `lint`, `typecheck`. Declare
   workspace dependency on `@awesome-markdown/contracts` (or whatever name
   M1 chose) and runtime deps `fastify`, `chokidar`, `simple-git`, plus dev
   deps `vitest`, `tsx`/`tsup` (match monorepo convention), `@types/node`.
2. Add `tsconfig.json` extending the base, with composite project settings
   and a reference to `packages/contracts`.
3. Add `vitest.config.ts` configured for Node environment, single fork
   (filesystem fixtures must not race), and a longer default test timeout
   (~10s) to accommodate debounce windows.
4. Create entry stub in `src/index.ts` that imports a `start()` from
   `src/server.ts` (added in Step 5).
5. Add a brief README placeholder; expand in Step 9.

**Rules:**
- Must reuse the monorepo's existing TS build/lint conventions (mirror M4).
- Must not introduce a new package manager or test framework.

**Output:**
- `pnpm --filter sync-engine typecheck` and `pnpm --filter sync-engine test`
  resolve (suite empty for now).

---

### Step 2: Define internal types and import contract event types
**Objective:** Establish the shared types this app depends on and the
internal-only types it owns.

**Files:**
- `apps/sync-engine/src/types.ts` (create)
- `packages/contracts/src/events.ts` (verify; modify only if missing fields)

**Actions:**
1. Import the `change`, `synced`, `offline` event payload schemas/types from
   `packages/contracts`.
2. If a contract field needed by this milestone is absent (e.g. `commitSha`,
   `paths`, `source: "self" | "external" | "mixed"`, `reason` for offline),
   raise it in §9 Open Questions rather than mutate contracts unilaterally —
   M1 owns that schema. Add a contract update only if the gap is trivial and
   non-breaking (additive optional field) and document the addition.
2. Define internal types in `types.ts`: `RawFsEvent`, `Batch`,
   `CommitResult`, `EngineConfig`, `EngineStatus`. None of these leak over
   the wire; SSE payloads use contract types verbatim.

**Rules:**
- Must not redefine wire types locally.
- Must not import from `provider-fs` (sync-engine is independent).

**Output:**
- A typed surface ready for the watcher, committer, and SSE hub modules.

---

### Step 3: Configuration loader
**Objective:** Centralized, validated runtime configuration.

**Files:**
- `apps/sync-engine/src/config.ts` (create)
- `apps/sync-engine/src/config.schema.ts` (create — zod schema for config)

**Actions:**
1. Define a zod schema for `EngineConfig` covering `repoRoot` (absolute
   path, must exist), `contentDir` (relative to repoRoot, default
   `content`), `commitAuthorName`, `commitAuthorEmail` (default to a
   sentinel like `awesome-markdown-sync <sync@local>`), `debounceMs`
   (default 750, min 50), `port` (default 7402 — pick a free port distinct
   from sidecar), `host` (default `127.0.0.1`).
2. Load values in priority order: explicit argument to `start()` >
   environment variables (prefix `SYNC_ENGINE_`) > config file at
   `${repoRoot}/.awesome-markdown/sync.config.json` if present > defaults.
3. Validate via zod and fail fast with a descriptive error on invalid
   config.

**Rules:**
- Must not read or mutate any path outside `repoRoot`.
- Must fail at startup, not lazily, on invalid config.

**Output:**
- A `loadConfig()` function returning a frozen, validated `EngineConfig`.

---

### Step 4: Watcher + debouncer + committer modules
**Objective:** Detect file changes, batch them, and turn each batch into one
local git commit.

**Files:**
- `apps/sync-engine/src/watcher.ts` (create)
- `apps/sync-engine/src/debouncer.ts` (create)
- `apps/sync-engine/src/committer.ts` (create)
- `apps/sync-engine/src/source-classifier.ts` (create)

**Actions:**
1. In `watcher.ts`, wrap chokidar to watch `${repoRoot}/${contentDir}`,
   ignoring `**/.git/**`, dotfiles, and editor swap files (`*~`, `.swp`,
   `.tmp`). Expose a typed event emitter that produces `RawFsEvent`
   (`add` | `change` | `unlink`, absolute path, timestamp). On `error`,
   log, close, and schedule a restart with capped exponential backoff;
   surface the disruption as a domain signal (consumed by the SSE hub).
2. In `debouncer.ts`, accumulate `RawFsEvent`s into a `Batch` and flush
   when `debounceMs` of quiescence elapses since the last event. Coalesce
   per-path: if a file is added then deleted within a window, drop it; if
   modified multiple times, keep one entry. Output a flushed `Batch` with
   deduped relative paths.
3. In `source-classifier.ts`, expose a `markSelfWrite(paths, ttlMs)` API
   the engine can call when it knows a write originated locally (reserved
   for future sidecar-coordinated marking). Classify each batch as `self`
   (all paths recently marked), `external` (none marked), or `mixed`.
   Default classification for this milestone, absent any caller invoking
   the marker, is `external`.
4. In `committer.ts`, accept a flushed `Batch`, call `simple-git` to stage
   the affected paths (use explicit path args, never `add -A` outside
   `contentDir`), commit with author from config and a structured message
   (e.g. `[sync-engine] <source>: <N> file(s)` plus a trailer block listing
   relative paths). Return `CommitResult { sha, paths, source, message }`.
   If the working tree has no actual diff after dedup (e.g. atomic-save
   touched mtime only), skip the commit and return a `noop` result.

**Rules:**
- Must commit only paths inside `contentDir`.
- Must not call any remote git command (no `pull`, `push`, `fetch`).
- Must surface git errors to the caller; never swallow them silently.

**Output:**
- A reusable pipeline: `RawFsEvent` → `Batch` → `CommitResult`.

---

### Step 5: Fastify server, SSE hub, and engine wiring
**Objective:** Expose HTTP endpoints and stream events to subscribers.

**Files:**
- `apps/sync-engine/src/server.ts` (create)
- `apps/sync-engine/src/sse-hub.ts` (create)
- `apps/sync-engine/src/engine.ts` (create — orchestrator)
- `apps/sync-engine/src/index.ts` (modify — call `start()` from server.ts)

**Actions:**
1. In `sse-hub.ts`, maintain a set of subscribers. Provide `subscribe(reply)`
   that sets the SSE response headers, writes an initial comment heartbeat,
   registers a periodic heartbeat (every ~15s) to keep proxies alive, and
   removes the subscriber on `close`. Provide `broadcast(event)` accepting
   the contract event union; serialize each event with an `event:` line
   matching the union tag and a `data:` line carrying the JSON payload.
2. In `engine.ts`, wire watcher → debouncer → committer; on each successful
   commit, broadcast a `change` event (paths, sha, source) followed by a
   `synced` event. On committer/watcher failure, broadcast `offline` with
   a reason and retry per backoff policy. Expose `getStatus()` for the
   `/status` route.
3. In `server.ts`, register Fastify with the SSE hub and engine. Routes:
   `GET /events` → hands the reply to `sse-hub.subscribe`; `GET /health`
   → 200 when running; `GET /status` → current `EngineStatus`.
4. Wire graceful shutdown: SIGINT/SIGTERM closes the watcher, drains the
   pending debounce batch (one final commit), closes SSE subscribers, then
   closes Fastify.

**Rules:**
- Must use Fastify v5 streaming reply semantics for SSE; no third-party SSE
  plugin.
- Must not block the event loop while committing (run git in async).
- Must validate that `Last-Event-ID` headers, if present, are accepted but
  no replay is required this milestone (note in §9).

**Output:**
- A runnable service (`pnpm --filter sync-engine dev`) that streams events
  over SSE.

---

### Step 6: Test fixtures and harness
**Objective:** Provide deterministic helpers for spinning up temp git repos
and observing SSE.

**Files:**
- `apps/sync-engine/test/helpers/tempRepo.ts` (create)
- `apps/sync-engine/test/helpers/sseClient.ts` (create)
- `apps/sync-engine/test/helpers/engineHarness.ts` (create)

**Actions:**
1. `tempRepo.ts`: create an OS temp directory under the test runner's
   workspace, `git init`, set local `user.name`/`user.email`, create a
   `content/` subdir with one seed file, make an initial commit. Export
   teardown that removes the directory.
2. `sseClient.ts`: connect to the engine's `/events` URL using Node's
   built-in fetch streaming, parse `event:`/`data:` frames, expose an
   async iterator and a `waitFor(predicate, timeout)` helper.
3. `engineHarness.ts`: start the engine on an ephemeral port pointing at a
   temp repo, expose helpers `writeFile`, `deleteFile`, `waitForCommit`,
   and a `stop()` that drains and closes everything.

**Rules:**
- Must not depend on the user's global git config (set local config in
  fixture).
- Must use ephemeral ports (port 0) to avoid collisions in CI.
- Must clean up temp dirs even on test failure.

**Output:**
- A reusable test kit consumed by the suites in Step 7.

---

### Step 7: Author Vitest suites
**Objective:** Cover all milestone-required behaviors with deterministic tests.

**Files:**
- `apps/sync-engine/test/watcher-commit.test.ts` (create)
- `apps/sync-engine/test/batching.test.ts` (create)
- `apps/sync-engine/test/sse.test.ts` (create)
- `apps/sync-engine/test/resilience.test.ts` (create)
- `apps/sync-engine/test/config.test.ts` (create)

**Actions:**
1. `watcher-commit.test.ts`: for each of create / modify / delete in
   `content/`, assert exactly one commit appears within the debounce window
   plus margin, the commit message identifies the source classification,
   and the changed path(s) match.
2. `batching.test.ts`: write N (e.g. 5) files within < debounce window;
   assert exactly one commit with all N paths. Then perform two bursts
   separated by > debounce window; assert exactly two commits.
3. `sse.test.ts`: connect two SSE clients before triggering writes; assert
   both receive identical, schema-valid `change` events with matching
   `commitSha`, followed by `synced`. Validate payloads against the
   `packages/contracts` schemas.
4. `resilience.test.ts`: simulate a transient watcher failure (e.g. close
   the chokidar instance underneath, or temporarily make a path
   unreadable); assert the engine emits `offline`, recovers, and
   subsequent writes still produce commits and `change` events.
5. `config.test.ts`: invalid config (missing repoRoot, non-numeric
   debounce) fails fast with a descriptive error; valid env-var-driven
   config boots successfully.

**Rules:**
- Must use only Vitest. Must not import or invoke `agent-browser`,
  Playwright, or any browser harness.
- Must run serially within a file (filesystem fixtures); files may run in
  parallel only if each uses an isolated temp repo and ephemeral port.
- Must validate SSE payloads against contract schemas (zod `parse`), not
  shape-match locally.

**Output:**
- A green `pnpm --filter sync-engine test` covering all DoD items.

---

### Step 8: Wire milestone command into root scripts
**Objective:** Make the milestone verification invocable from the repo root.

**Files:**
- Root `package.json` (modify)

**Actions:**
1. Ensure `pnpm --filter sync-engine test` is reachable (no special script
   needed beyond pnpm filtering, but document it in main plan §"How to
   run"). Add a root `test:sync-engine` alias if the monorepo follows that
   convention for other apps.
2. Do **not** wire this app into `verify:ui`; that aggregate is M8's
   responsibility.

**Rules:**
- Must not change behavior of existing root scripts.

**Output:**
- One canonical command to run this milestone's verification.

---

### Step 9: Document the app
**Objective:** Operational README.

**Files:**
- `apps/sync-engine/README.md` (modify)

**Actions:**
1. Document: purpose, supported config keys (env + file), default port,
   the SSE channel (URL, event names, payload shape pointer to contracts),
   how to run in dev, how to run tests, current limitations (no remote
   sync — see M7), and the source-classification caveat.

**Rules:**
- Must reference contract types by name, not duplicate their fields.

**Output:**
- A README sufficient for an operator and for M7's author to extend.

---

## 5. Data Model / Schema (if applicable)

This milestone introduces no persistent schema beyond the git commit log
itself.

**Commit message convention (informational):**
- Subject: `[sync-engine] <source>: <N> file(s)`
- Trailer block: one path per line, `Path: <relative path>` plus
  `Source: self|external|mixed` and `Batch-Id: <uuid>`.
- Author: from config (`commitAuthorName <commitAuthorEmail>`).

**SSE event payloads:** owned by `packages/contracts` (event union from
M1). This milestone consumes them; any additive field needed (see §9) must
land via a contracts PR, not inline.

## 6. Use Case Implementation

**Use Cases Covered (engine layer only):**
- **UC-1** (kanban-ui edit, sync-engine online): provides the watcher →
  commit → `change`/`synced` SSE emissions for self-authored writes from
  the sidecar. Remote push is M7. UI surface verified later.
- **UC-3** (external Notepad edit): provides the external-write detection
  path; commits the change and broadcasts `change` so the UI re-fetches.
  UI surface is verified by the M8 aggregate `pnpm verify:ui` smoke — this
  milestone does **not** own that verification.

**Layer Responsibility:**
- Translate filesystem events in `content/` into atomic local git commits.
- Broadcast a typed event stream over SSE matching contracts.
- Tolerate transient FS errors and surface them as `offline` events.

**Interface Notes:**
- The exact discriminator for `change.source` (`self` / `external` /
  `mixed`) and presence of `commitSha` on `change` depend on the M1
  contract. If absent, see §9.

## 7. Validation & Verification

**Tooling: Vitest only. Agent-browser is NOT used in this milestone.**

- Run: `pnpm --filter sync-engine test`.
- Coverage of DoD:
  - Step 7 / `watcher-commit.test.ts` verifies create/modify/delete →
    debounced commit with expected message + paths.
  - Step 7 / `batching.test.ts` verifies concurrent multi-file changes
    coalesce into one commit.
  - Step 7 / `sse.test.ts` verifies SSE clients receive `change` events
    per batch with affected paths and that payloads pass contract zod
    validation.
  - Step 7 / `resilience.test.ts` verifies watcher resumes after a
    transient FS error and emits `offline` then recovers.
  - Step 7 / `config.test.ts` verifies fail-fast config validation.
- UI surface of UC-3 (external edit propagates into the board) is **out of
  scope here** and is verified by the aggregate `pnpm verify:ui` smoke set
  up in M8. This plan only flags the dependency.
- Manual sanity (optional, not gating): start the engine against a real
  repo, save a file in `content/` from an external editor, observe the
  commit and the SSE frame via `curl -N`.

## 8. Rollback Strategy
- The app is additive: removing `apps/sync-engine/` and its workspace
  registration fully reverts the milestone with no schema or data
  migration. No global state is introduced.
- Commits already authored by the engine remain in the local git history;
  they are valid commits and require no cleanup. If desired, they can be
  identified and reverted by their author or message prefix.
- No changes to other packages are required (contracts changes, if any,
  are additive optional fields and safe to keep).

## 9. Open Questions
- **Contract event fields:** Does the `change` event in `packages/contracts`
  already include `commitSha`, `paths: string[]`, and a `source`
  discriminator? If not, an additive contracts patch is needed; flag for M1
  owner before implementation.
- **Self-write marker channel:** This milestone exposes
  `markSelfWrite(paths)` but does not define how the sidecar invokes it
  (in-process vs HTTP vs shared file). Decision deferred — current default
  classifies all writes as `external`, which is correct and acceptable for
  M6 DoD. Clarify in M7 or a follow-up.
- **SSE replay / `Last-Event-ID`:** Should reconnecting clients receive
  missed events? Not required this milestone; deferred. Note in README.
- **Default port:** 7402 chosen tentatively; confirm no collision with
  sidecar (M4) and any other monorepo service.
- **Initial-scan behavior:** On startup, should the engine treat existing
  uncommitted changes in `content/` as a batch and commit them
  immediately? Proposed: yes (covers UC-2 reconnect path). Confirm.
- **Windows path handling:** chokidar polling may be needed on Windows /
  network drives; out of scope for default config. Note in README.

## 10. References
- chokidar (file watching): https://github.com/paulmillr/chokidar
- simple-git (git wrapper): https://github.com/steveukx/git-js
- Fastify v5 docs: https://fastify.dev/docs/latest/
- Fastify reply streaming (basis for SSE):
  https://fastify.dev/docs/latest/Reference/Reply/#sendsrc
- Server-Sent Events spec (MDN):
  https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Vitest docs: https://vitest.dev/
- Related milestone plans: `ai-docs/awesome-markdown-main.md` (§Milestones,
  §Use Cases UC-1 / UC-2 / UC-3, §Verification matrix), M4 (sidecar) and
  M7 (remote pull/push) plans.
