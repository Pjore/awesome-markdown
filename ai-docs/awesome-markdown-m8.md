# Milestone Plan: Conflict detection + mitigation flow

## 0. Metadata
- **Milestone:** 8 of 10
- **Complexity:** 5
- **Work:** 4
- **Estimated Files:** ~16
- **Dependencies:** M7 (remote pull/push, conflict event emission), M3 (kanban-ui MVP), M6 (sync-engine SSE channel)

## 1. Objective
Close the conflict round-trip introduced in M7 by adding a sync-engine HTTP resolution endpoint, an "open externally" launcher, and a UI banner + per-path resolution panel that drives the engine until the merge completes and `synced` re-emits.

## 2. Constraints & Assumptions
- Sync-engine already detects merge conflicts during pull and emits `conflict` SSE events with `{ paths: string[], hunks?: ... }` (delivered by M7). M8 only consumes that signal and adds the resolution path.
- Resolution choices are per file path, not per hunk. "Ours / theirs" map to git checkout-side semantics performed via `simple-git`.
- Conflict events apply to a single in-flight merge; the sync-engine tracks at most one active conflict session at a time. Concurrent merges are out of scope.
- "Open externally" uses the OS default handler for the file path (not a configurable editor). Implementation surface is the sync-engine host process.
- UI is browser-side and cannot spawn local processes; all OS interaction is delegated to sync-engine endpoints.
- "Affected items" in UI = any kanban item whose backing file path is in the active conflict's path set. Lookup uses the existing path→item index from M3.
- Read-only safeguard is enforced in UI only (defense in depth in sync-engine is out of scope; the working tree is locked by the in-progress merge anyway).
- SSE transport (EventSource) from M6 is reused; no new transport.
- Authentication: sync-engine endpoints remain on the existing localhost-bound listener with no additional auth (matches M6/M7 posture).

## 3. Deliverables (Definition of Done)
- [ ] Sync-engine exposes `POST /sync/conflict/resolve` accepting per-path decisions (`ours` | `theirs` | `external`) and applies them to the working tree.
- [ ] Sync-engine exposes `POST /sync/conflict/open` that launches the OS default editor for a given path.
- [ ] Sync-engine exposes `GET /sync/conflict/state` returning the active conflict (or null) for late-joining UI clients.
- [ ] Sync-engine exposes `POST /sync/conflict/inject` (test-only, gated by env flag) to trigger a controlled conflict against a local bare-repo remote for verification.
- [ ] After all paths are resolved, sync-engine completes the merge commit, pushes, and emits `synced`.
- [ ] kanban-ui subscribes to `conflict` SSE events and renders a persistent banner.
- [ ] kanban-ui renders a resolution panel listing affected paths with three actions per path: ours, theirs, open externally.
- [ ] Affected items are non-editable while their path is unresolved; banner persists until `synced` is received.
- [ ] `apps/kanban-ui/agent-browser/m8/` scenarios pass.
- [ ] `apps/sync-engine/test/` Vitest resolution-endpoint suite passes.
- [ ] `pnpm --filter kanban-ui verify:m8` and `pnpm --filter sync-engine test` succeed.

## 4. Step-by-Step Execution Plan

### Step 1: Define conflict-resolution contracts
**Objective:** Add typed request/response shapes shared by sync-engine and UI.

**Files:**
- `packages/contracts/src/conflict.ts` (create)
- `packages/contracts/src/index.ts` (modify)

**Actions:**
1. Add `ConflictPath` type (path, ours-side label, theirs-side label, optional hunk summary).
2. Add `ConflictState` type (mergeId, startedAt, paths: ConflictPath[], pendingPaths: string[], resolvedPaths: Record<path, decision>).
3. Add `ResolveDecision` union: `"ours" | "theirs" | "external"`.
4. Add `ResolveRequest` (mergeId, decisions: Record<path, ResolveDecision>).
5. Add `ResolveResponse` (status: `"applied" | "completed" | "pending"`, remainingPaths: string[]).
6. Add `OpenExternalRequest` (path) and `OpenExternalResponse` (status).
7. Re-export from `packages/contracts/src/index.ts`.

**Rules:**
- No `any`; every field typed.
- Reuse existing SSE `ConflictEvent` shape from M7; do not redefine.

**Output:** Shared types consumed by both apps.

---

### Step 2: Add conflict-session state to sync-engine
**Objective:** Track the active merge across HTTP calls.

**Files:**
- `apps/sync-engine/src/conflict/session.ts` (create)
- `apps/sync-engine/src/state.ts` (modify, if exists; otherwise integrate into engine module)

**Actions:**
1. Create an in-memory `ConflictSession` store keyed by mergeId with a single-active-session invariant.
2. Store: original branch ref, merge base, path list, decisions map, pendingPaths set, status.
3. Expose getters: `getActive()`, `isAffected(path)`, `recordDecision(path, decision)`.
4. Wire creation on conflict detection (extend M7 conflict handler to populate session before emitting SSE).
5. Wire teardown on successful merge commit + push.

**Rules:**
- Must persist nothing to disk; session lives only while merge is in-flight (the working tree itself is the durable state).
- Must reject creation of a second session while one is active.

**Output:** Authoritative state used by all conflict endpoints.

---

### Step 3: Implement resolution endpoint
**Objective:** Apply per-path decisions and finalize the merge.

**Files:**
- `apps/sync-engine/src/http/conflict-routes.ts` (create)
- `apps/sync-engine/src/http/server.ts` (modify to mount routes)
- `apps/sync-engine/src/conflict/resolver.ts` (create)

**Actions:**
1. Mount `POST /sync/conflict/resolve`, `POST /sync/conflict/open`, `GET /sync/conflict/state`.
2. In resolver: for each `ours` path, take the local side via simple-git checkout-ours semantics, then stage. For each `theirs`, take incoming side and stage. For `external`, mark as pending and do not stage.
3. Validate request: mergeId matches active session; all paths are in the session; decisions are valid enum values.
4. After applying, recompute pendingPaths. If empty, complete the merge commit, push, emit `synced`, clear session, respond `completed`.
5. If pending paths remain, respond `pending` with remainingPaths.
6. Return `applied` for partial success without completion.

**Rules:**
- Must be idempotent: repeated calls with same decisions on already-staged paths are no-ops, not errors.
- Must reject unknown mergeId with HTTP 409.
- Must reject unknown paths with HTTP 400.
- Must not push unless every path is resolved (no `external` pending).
- Must surface simple-git failures as HTTP 500 with structured error body.

**Output:** Working resolve endpoint completing the merge round-trip.

---

### Step 4: Implement "open externally" endpoint
**Objective:** Launch OS default handler for a path inside the working tree.

**Files:**
- `apps/sync-engine/src/conflict/open-external.ts` (create)
- `apps/sync-engine/src/http/conflict-routes.ts` (modify)

**Actions:**
1. Resolve the requested path against the configured working-tree root and reject anything outside it.
2. Spawn the OS default opener (`xdg-open` on Linux, `open` on macOS, `start` on Windows) detached, ignoring stdio.
3. Record an `external` decision in the active session for that path so UI sees pending state.
4. Return success once the spawn is dispatched (do not wait for editor exit).

**Rules:**
- Must reject path traversal (`..`, absolute paths outside repo root).
- Must not block the HTTP response on the spawned process.
- Must require an active conflict session; reject otherwise.

**Output:** Endpoint that delegates editor launch from the browser.

---

### Step 5: Implement test-only conflict injector
**Objective:** Allow agent-browser and Vitest to deterministically trigger a conflict.

**Files:**
- `apps/sync-engine/src/conflict/inject.ts` (create)
- `apps/sync-engine/src/http/conflict-routes.ts` (modify)
- `apps/sync-engine/src/config.ts` (modify to read `SYNC_ENGINE_TEST_HOOKS=1`)

**Actions:**
1. Mount `POST /sync/conflict/inject` only when test-hooks env flag is set.
2. Accept `{ paths: string[], oursContent: Record<path,string>, theirsContent: Record<path,string> }`.
3. Set up a local bare-repo remote, write `theirs` content via a side branch on the remote, write `ours` content locally, attempt a pull, surface the resulting natural conflict through the existing M7 path.

**Rules:**
- Must refuse to mount unless env flag is explicit.
- Must operate inside an isolated working-tree configured for tests (no production data).

**Output:** Deterministic conflict trigger used by both verifiers.

---

### Step 6: Sync-engine resolution Vitest suite
**Objective:** Cover endpoint behavior at unit/integration level.

**Files:**
- `apps/sync-engine/test/conflict-resolve.test.ts` (create)
- `apps/sync-engine/test/conflict-open.test.ts` (create)
- `apps/sync-engine/test/fixtures/bare-remote.ts` (create)

**Actions:**
1. Spin up a temp working tree + local bare remote per test.
2. Inject a two-path conflict, call resolve with `ours` for one and `theirs` for the other, assert: resolved file contents match expected sides, merge commit exists, push succeeded against bare remote.
3. Assert idempotency: re-posting same decisions returns success without altering history.
4. Assert validation errors: unknown mergeId → 409; unknown path → 400; invalid decision enum → 400; empty body → 400.
5. For open endpoint: stub spawner; assert path-traversal rejection; assert decision recorded.

**Rules:**
- Must not require network access.
- Must clean up temp directories.

**Output:** `pnpm --filter sync-engine test` green for M8 cases.

---

### Step 7: UI conflict event subscription
**Objective:** Receive `conflict` events and hydrate state on reconnect.

**Files:**
- `apps/kanban-ui/src/sync/conflict-store.ts` (create)
- `apps/kanban-ui/src/sync/sse-client.ts` (modify)
- `apps/kanban-ui/src/sync/conflict-api.ts` (create)

**Actions:**
1. Extend the existing EventSource subscription to dispatch `conflict` and `synced` event types into the conflict store.
2. On UI mount, call `GET /sync/conflict/state` once to hydrate any conflict that started before the tab opened.
3. Conflict store exposes: `activeConflict`, `isPathAffected(path)`, `decisionFor(path)`, `submitDecisions(map)`, `requestOpenExternal(path)`.
4. On `synced` event for the active mergeId, clear the store.

**Rules:**
- Must follow MDN EventSource reconnection semantics; do not duplicate active conflicts on reconnect.
- Must coalesce repeated `conflict` events for the same mergeId (idempotent set state).

**Output:** Reactive store powering the banner and panel.

---

### Step 8: UI conflict banner + resolution panel
**Objective:** Surface the conflict and collect user decisions.

**Files:**
- `apps/kanban-ui/src/components/ConflictBanner.tsx` (create)
- `apps/kanban-ui/src/components/ConflictPanel.tsx` (create)
- `apps/kanban-ui/src/app/AppShell.tsx` (modify to mount banner)
- `apps/kanban-ui/src/styles/conflict.css` (create)

**Actions:**
1. Banner renders when `activeConflict` is non-null. Shows count of affected paths, "Resolve" action that opens the panel.
2. Panel lists each affected path with three buttons: "Use mine", "Use remote", "Open externally" plus a status indicator (unresolved / pending external / resolved).
3. Submit button enabled only when every path has a decision and no `external` decision is still pending external completion.
4. On submit, call `POST /sync/conflict/resolve` with the decisions map.
5. "Open externally" calls `POST /sync/conflict/open` and shows pending state until the path is resolved by user (returning to the panel and choosing ours/theirs after editing).
6. Banner persists until store clears via `synced`.

**Rules:**
- Must display the literal repo-relative path for each entry.
- Must disable submission while a request is in flight.
- Must show server validation errors inline.

**Output:** Visible conflict UX matching UC-4 conflict path.

---

### Step 9: Read-only safeguards on affected items
**Objective:** Prevent edits to items whose backing path is in the active conflict.

**Files:**
- `apps/kanban-ui/src/board/itemEditing.ts` (modify)
- `apps/kanban-ui/src/board/Card.tsx` (modify)
- `apps/kanban-ui/src/board/dnd.ts` (modify)

**Actions:**
1. Consult `conflictStore.isPathAffected(item.path)` before enabling inline edit, drag handles, delete, and column move on each card.
2. Render a small lock indicator on affected cards with tooltip explaining the conflict.
3. Block keyboard shortcuts that mutate affected items.
4. On resolution success (store cleared), re-enable editing without page reload.

**Rules:**
- Non-affected items must remain fully editable.
- Must not mutate provider state for affected items even on stale callbacks.

**Output:** Enforced edit lock during the conflict window.

---

### Step 10: agent-browser scenarios for M8
**Objective:** Validate full UI round-trip.

**Files:**
- `apps/kanban-ui/agent-browser/m8/scenario-resolve-mixed.ts` (create)
- `apps/kanban-ui/agent-browser/m8/scenario-open-external-pending.ts` (create)
- `apps/kanban-ui/agent-browser/m8/setup.ts` (create)
- `apps/kanban-ui/package.json` (modify: add `verify:m8` script)

**Actions:**
1. Setup boots ui + sync-engine with `SYNC_ENGINE_TEST_HOOKS=1` against a temp working tree and bare remote.
2. Scenario A: inject a two-path conflict; assert banner appears with both paths; assert affected cards rendered as read-only (lock indicator present, edit handler does not commit); pick `ours` for path1 and `theirs` for path2; submit; assert banner disappears, items become editable, board reflects resolved content, `synced` indicator visible.
3. Scenario B: inject a one-path conflict; pick "open externally" (spawner stubbed via env); assert banner remains and panel shows pending-external state; subsequently pick `ours` for the same path; submit; assert resolution completes.
4. Add `verify:m8` script invoking both scenarios.

**Rules:**
- Must produce a deterministic exit code and a saved scenario log per AC-9.
- Must tear down spawned processes and temp dirs.

**Output:** Reproducible UI verification runs.

---

### Step 11: Documentation updates
**Objective:** Record the conflict flow.

**Files:**
- `apps/sync-engine/README.md` (modify)
- `apps/kanban-ui/README.md` (modify)
- `ai-docs/awesome-markdown-m8.md` (this file — already created)

**Actions:**
1. Document the four endpoints (resolve, open, state, inject) with request/response shapes.
2. Document the test-hooks env flag.
3. Document UI banner/panel behavior and read-only rules.

**Rules:**
- Keep each README under the AC-8 word ceiling overall.

**Output:** User-facing docs aligned with shipped behavior.

## 5. Data Model / Schema

**Entity: ConflictSession (in-memory)**
- Fields: `mergeId` (string, ulid), `startedAt` (ISO timestamp), `paths` (string[]), `decisions` (Record<path, "ours"|"theirs"|"external">), `pendingPaths` (string[]), `originalRef` (string), `status` (`"awaiting"|"completing"|"completed"`).
- Relationships: 1:N with `ConflictPath`. Singleton at runtime.
- Indexes: none (single active session).
- Constraints: only one session with status ≠ `completed` may exist; mergeId unique per process lifetime.

**Entity: ConflictPath**
- Fields: `path` (string, repo-relative), `oursLabel` (string), `theirsLabel` (string), `decision` (nullable enum).
- Constraints: `path` unique within a session; `path` must resolve inside working-tree root.

## 6. Use Case Implementation

**Use Cases Covered:**
- UC-4 (UI surface): conflict path. M8 implements the user-visible branch where `git pull` produced a merge conflict — resolution UI in the browser drives the sync-engine to finish the merge and push.

**Layer Responsibility:**
- Sync-engine: detect (M7), expose state, accept decisions, mutate working tree, complete merge, push, emit `synced`, launch external editor.
- UI: subscribe to `conflict`/`synced`, render banner + panel, enforce read-only, submit decisions, request external open.

**Interface Notes:**
- UC-4 does not specify whether resolution is per-path or per-hunk. M8 commits to per-path; finer granularity is out of scope.
- UC-4 does not specify behavior when user picks "open externally" then never returns. M8 keeps the banner persistent until the user explicitly resolves via ours/theirs after editing — see Open Questions.

## 7. Validation & Verification

Two verifiers, both required for milestone sign-off.

**Verifier A — agent-browser (UI scenarios)** — `apps/kanban-ui/agent-browser/m8/`, invoked by `pnpm --filter kanban-ui verify:m8`:
- Asserts conflict banner appears after injection and lists exactly the injected paths.
- Asserts cards backed by affected paths are read-only (edit handler suppressed, lock indicator present, drag disabled).
- Asserts non-affected cards remain fully editable.
- Asserts that submitting `ours` for one path and `theirs` for another clears the banner, restores editability, updates the board to resolved content, and surfaces the `synced` indicator.
- Asserts that "open externally" leaves the banner up and the panel in pending-external state until a follow-up ours/theirs decision finalizes the path.
- Asserts late-joining UI (reload during conflict) hydrates banner via `GET /sync/conflict/state`.

**Verifier B — Vitest (sync-engine endpoints)** — `apps/sync-engine/test/`, invoked by `pnpm --filter sync-engine test`:
- Asserts resolution with `ours` produces commit content equal to the local side; with `theirs` equal to the remote side; mixed decisions across paths produce expected per-path content.
- Asserts push succeeds against the local bare remote and the remote ref advances.
- Asserts idempotency: replaying the same `POST /sync/conflict/resolve` after completion returns success without altering history.
- Asserts bad-input handling: unknown mergeId → 409; unknown path → 400; invalid decision → 400; empty body → 400.
- Asserts `POST /sync/conflict/open` rejects path traversal and refuses without active session.
- Asserts `synced` event is emitted exactly once per completed merge.

**Manual scenarios (smoke):**
- Run with real OS opener and confirm default editor launches for a markdown file.
- Force network failure during the post-resolution push and confirm sync-engine surfaces error and retains the session.

## 8. Rollback Strategy
- All changes are additive: new endpoints, new UI components, new contracts. Reverting M8 leaves M7 conflict detection intact but without UI mitigation.
- No schema or on-disk migrations; the conflict session is in-memory.
- If resolution endpoint misbehaves in production, disabling the route mount in `apps/sync-engine/src/http/server.ts` restores M7-only behavior; UI banner becomes a read-only indicator (still safe).
- Test-hook endpoint is gated by env and absent in normal runs; no rollback needed.

## 9. Open Questions
- Should "open externally" auto-detect when the user has saved+resolved markers and offer a one-click "mark resolved" instead of requiring a follow-up ours/theirs choice? Deferred — current plan requires explicit ours/theirs after external edit.
- Should the resolution panel show diff hunks inline? Main plan UC-4 mentions hunks in the conflict event but does not require UI rendering. M8 lists paths only; hunk view is deferred.
- Should there be a "cancel merge" / `git merge --abort` action exposed in UI? Not in deliverables; flag for M10 polish.
- What is the desired behavior if the sync-engine restarts mid-conflict? Working tree retains conflict markers; on boot the engine should re-detect and re-emit. Confirm engine boot path covers this — may require a small addition to M7 boot sequence.
- Authentication on resolve/open endpoints — currently unauthenticated localhost. Acceptable for local-only stack but should be revisited if sync-engine is ever exposed.

## 10. References
- simple-git merge & conflict handling: https://github.com/steveukx/git-js/blob/main/docs/MERGE.md
- simple-git checkout (for ours/theirs path resolution): https://github.com/steveukx/git-js/blob/main/docs/CHECKOUT.md
- Git merge strategies (`-X ours` / `-X theirs` semantics): https://git-scm.com/docs/merge-strategies
- Git `checkout --ours` / `--theirs`: https://git-scm.com/docs/git-checkout#Documentation/git-checkout.txt---ours
- MDN EventSource (SSE client semantics, reconnection): https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- MDN Server-sent events overview: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Node `child_process.spawn` (detached opener): https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
- Related: `ai-docs/awesome-markdown-main.md` (UC-4, AC-6, AC-9), `ai-docs/awesome-markdown-m7.md` (conflict event source)
