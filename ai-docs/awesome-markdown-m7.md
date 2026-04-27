# Milestone Plan: Sync-engine — remote pull/push + offline tolerance

## 0. Metadata
- **Milestone:** 7 of 10
- **Complexity:** 4
- **Work:** 3
- **Estimated Files:** ~14 (8 source, 4 test, 2 doc/config)
- **Dependencies:** M6 (watcher + auto-commit + SSE hub already in place);
  `packages/contracts` event union (`change`, `conflict`, `synced`, `offline`)
  from M1.

## 1. Objective
Extend the existing `apps/sync-engine/` service to keep the local git
repository in sync with a GitHub remote: periodic fast-forward pulls, push
after each auto-commit, retry/backoff on transient failures, conflict
detection (without resolution), and graceful offline tolerance — all surfaced
to subscribers as contract-typed SSE events.

## 2. Constraints & Assumptions
- Git remote auth uses a GitHub Fine-Grained PAT supplied via the
  `GITHUB_TOKEN` env var (per main plan §9). The engine builds the
  authenticated HTTPS remote URL on the fly; the token is never written to
  disk, into commits, or into log lines.
- Remote URL itself comes from the existing local clone's `origin`
  (`git remote get-url origin`); the engine does not provision new remotes.
- Default branch is whatever `origin/HEAD` points at; the engine reads it
  rather than hard-coding `main`.
- Pull cadence: configurable interval (default 30s). No webhook listener in
  this milestone.
- Conflict event payload shape (path list + diff hunks) is the contract
  defined in `packages/contracts` from M1; this plan consumes it. If the
  exact `hunks` shape is under-specified, see §9.
- M7 detects conflicts and emits the event; **resolution UI and
  ours/theirs/external completion live in M8**.
- "Offline" is any classifiable network/auth failure (DNS, ECONNREFUSED,
  ETIMEDOUT, TLS, 5xx, 401/403). Non-network errors (e.g. corrupted index)
  are surfaced as engine errors, not `offline`.
- Tests run against a **local bare repo on the filesystem** acting as
  remote; no real GitHub network calls in CI.
- Single-writer assumption stays: only the sync-engine pushes from this
  clone. Force-push is never used.

## 3. Deliverables (Definition of Done)
- [ ] `remote-config.ts`: resolves remote URL, default branch, auth from
      `GITHUB_TOKEN`; redacts token in any surfaced string.
- [ ] `puller.ts`: periodic `git fetch` + `git merge --ff-only`; classifies
      result as `up-to-date` | `fast-forwarded` | `cannot-fast-forward` |
      `network-failure`; emits `change` per file modified by a successful
      fast-forward and `synced` after a successful pull cycle.
- [ ] `pusher.ts`: pushes current branch after each successful auto-commit;
      classifies result as `pushed` | `up-to-date` | `rejected-non-ff` |
      `network-failure`; emits `synced` on success.
- [ ] `conflict-detector.ts`: when pull cannot fast-forward, computes
      affected paths and per-path diff hunks (local vs remote) without
      mutating the working tree; emits a single `conflict` event matching
      the contract.
- [ ] `retry-scheduler.ts`: exponential backoff with jitter and cap;
      separate schedules for pull and push; resumes on success.
- [ ] `offline-state.ts`: tracks online/offline transitions; debounces
      `offline` emission; emits `synced` once after recovery.
- [ ] Engine orchestrator (`engine.ts`) extended: pull loop, post-commit
      push hook, retry queue, conflict short-circuit, SSE broadcasts.
- [ ] Config schema extended for `pullIntervalMs`, `pushTimeoutMs`,
      `retry.*`, plus `GITHUB_TOKEN` env wiring.
- [ ] Vitest suites covering: clone+commit+push round-trip; remote-only
      fast-forward → `change` events; network failure → `offline` →
      retry → `synced`; conflict simulation → `conflict` event with
      expected payload, no merge applied.
- [ ] `apps/sync-engine/README.md` updated with auth env var, pull/push
      semantics, and event taxonomy.
- [ ] `pnpm --filter sync-engine test` green on a clean checkout.

## 4. Step-by-Step Execution Plan

### Step 1: Extend configuration for remote sync
**Objective:** Add remote-sync settings to `EngineConfig` and load
`GITHUB_TOKEN` from environment.

**Files:**
- `apps/sync-engine/src/config.schema.ts` (modify)
- `apps/sync-engine/src/config.ts` (modify)

**Actions:**
1. Extend the zod `EngineConfig` schema with a `remote` section:
   `enabled` (default `true`), `pullIntervalMs` (default `30000`,
   min `2000`), `pushTimeoutMs` (default `15000`),
   `retry.initialMs` (default `1000`), `retry.maxMs` (default `60000`),
   `retry.factor` (default `2`), `retry.jitter` (default `0.2`).
2. Add an `auth` section sourced exclusively from env: read `GITHUB_TOKEN`
   into a non-enumerable, non-logged value. Treat empty/missing token as
   "auth unavailable" → engine still runs but disables remote operations
   and surfaces `offline` with reason `no-credentials`.
3. Add a `redactToken(text)` helper used everywhere a remote URL or git
   stderr might be logged or emitted.

**Rules:**
- Must never include the raw token in `EngineConfig`'s JSON-serialized
  form (omit from `toJSON`/status output).
- Must not read `GITHUB_TOKEN` from any source other than `process.env`.

**Output:**
- Validated config exposing `remote` settings and a token-bearing auth
  accessor distinct from the public config object.

---

### Step 2: Resolve remote URL and default branch
**Objective:** Centralize all remote-identity lookups so the rest of the
engine never builds URLs ad hoc.

**Files:**
- `apps/sync-engine/src/remote-config.ts` (create)

**Actions:**
1. On engine start, query the local repo for `origin` URL and the symbolic
   ref `refs/remotes/origin/HEAD` to derive the default branch name.
2. Provide `getAuthenticatedRemoteUrl()` that injects the token into the
   HTTPS URL using the GitHub-supported form
   (`https://x-access-token:<token>@github.com/<owner>/<repo>.git`); fall
   back to refusal if the origin is not HTTPS to GitHub.
3. Provide `getRedactedRemoteUrl()` for logs and event payloads.
4. Cache resolved values; expose a `refresh()` for tests.

**Rules:**
- Must reject SSH remotes in this milestone with a descriptive error
  (HTTPS-only path).
- Must never log or broadcast the authenticated URL.

**Output:**
- A small module returning `{ owner, repo, branch, redactedUrl }` and the
  privileged URL accessor.

---

### Step 3: Implement the puller
**Objective:** Periodically bring the local branch up to date with the
remote when fast-forward is possible; surface `change` and `synced`.

**Files:**
- `apps/sync-engine/src/puller.ts` (create)

**Actions:**
1. Expose `pullOnce()` that performs a `git fetch origin <branch>`
   followed by an attempt to fast-forward the local branch onto
   `origin/<branch>`. Use simple-git with the authenticated URL provided
   only at command time (never persisted into git config).
2. Compare `HEAD` before and after the merge to compute the list of paths
   changed by the fast-forward (diff name-only between old and new SHAs,
   filtered to `contentDir`).
3. Return a `PullResult` discriminated union:
   `{ kind: 'up-to-date' }` | `{ kind: 'fast-forwarded', paths, fromSha, toSha }`
   | `{ kind: 'cannot-fast-forward', localSha, remoteSha }` |
   `{ kind: 'network-failure', reason }`.
4. Provide `startPullLoop()` that schedules `pullOnce()` at
   `pullIntervalMs`, suspending while a commit/push is in flight (a single
   shared mutex with the pusher) and while in conflict-pending state.

**Rules:**
- Must use `merge --ff-only`; must never invoke a non-FF merge or rebase.
- Must not modify the working tree when result is `cannot-fast-forward`.
- Must classify auth/network errors into `network-failure` rather than
  raising, so the retry scheduler can react uniformly.
- Must not run while the working tree has uncommitted changes inside
  `contentDir`; defer until the next tick (the watcher/committer will
  resolve it).

**Output:**
- A puller that yields typed results and emits no events itself; the
  orchestrator decides which SSE events to broadcast.

---

### Step 4: Implement the pusher
**Objective:** Push the current branch after each successful auto-commit
and as part of recovery from offline.

**Files:**
- `apps/sync-engine/src/pusher.ts` (create)

**Actions:**
1. Expose `pushOnce()` that pushes `<branch>:<branch>` to origin using the
   authenticated URL at command time. No `--force`. Honor
   `pushTimeoutMs`.
2. Return a `PushResult` union:
   `{ kind: 'pushed', sha }` | `{ kind: 'up-to-date' }` |
   `{ kind: 'rejected-non-ff' }` | `{ kind: 'network-failure', reason }`.
3. On `rejected-non-ff`, do not attempt any auto-resolution; surface to
   the orchestrator, which will trigger a pull (which will then either
   fast-forward or raise `conflict`).
4. Hook: orchestrator calls `pushOnce()` after every non-`noop`
   `CommitResult` from M6's committer, sharing the pull/push mutex.

**Rules:**
- Must never force-push.
- Must not retry inside `pushOnce()`; retry policy lives in the scheduler.
- Must surface push stderr only after token redaction.

**Output:**
- A pusher returning typed results consumed by the orchestrator.

---

### Step 5: Implement conflict detection
**Objective:** When pull reports `cannot-fast-forward`, compute and emit a
`conflict` event matching the M1 contract; do not modify the tree.

**Files:**
- `apps/sync-engine/src/conflict-detector.ts` (create)

**Actions:**
1. On `cannot-fast-forward`, identify the merge base of local `HEAD` and
   `origin/<branch>` and the set of paths modified on both sides
   (intersection of name-only diffs base→local and base→remote, filtered
   to `contentDir`).
2. For each conflicting path, compute diff hunks for local-vs-base and
   remote-vs-base in unified-diff form, capped at a configurable
   per-file size to keep payloads bounded.
3. Build a `ConflictEvent` payload conforming to the contract:
   `{ branch, baseSha, localSha, remoteSha, files: [{ path, localHunks,
   remoteHunks }] }`. Validate against the contract zod schema before
   broadcast.
4. Mark engine state as `conflict-pending`; suspend the pull loop and
   block the pusher until M8's resolution flow clears the state. (For
   this milestone, expose only an internal `clearConflictState()` for
   tests; no public resolution API.)

**Rules:**
- Must not run `git merge`, `git rebase`, `git reset --hard`, or any
  command that mutates working tree or refs.
- Must emit at most one `conflict` event per detected conflict (dedupe by
  `localSha+remoteSha`).
- Must redact tokens in any embedded text.

**Output:**
- A detector returning a contract-valid `ConflictEvent` payload.

---

### Step 6: Implement retry scheduler and offline state
**Objective:** Centralize backoff and online/offline transitions.

**Files:**
- `apps/sync-engine/src/retry-scheduler.ts` (create)
- `apps/sync-engine/src/offline-state.ts` (create)

**Actions:**
1. In `retry-scheduler.ts`, expose two independent schedulers (`pull`,
   `push`). Each accepts a no-arg async task returning a "kind" tag and
   advances backoff on `network-failure`, resets to baseline on success,
   and ignores ticks while a conflict is pending.
2. Apply jitter to each delay; cap at `retry.maxMs`. Provide
   `cancel()` for graceful shutdown.
3. In `offline-state.ts`, maintain a small state machine:
   `online` → `offline(reason)` → `recovering` → `online`. Debounce
   `offline` emission so a single transient blip does not flap (e.g. only
   after the second consecutive `network-failure` or after a configurable
   debounce window).
4. Expose `onTransition(handler)` so the orchestrator can broadcast
   `offline` and a follow-up `synced` exactly once per recovery.

**Rules:**
- Must not buffer events while offline; the contract carries current
  state, not history.
- Must guarantee a `synced` is emitted after every recovery from a
  previously-broadcast `offline` (no silent recoveries).

**Output:**
- A backoff/offline subsystem the orchestrator composes with puller and
  pusher.

---

### Step 7: Wire orchestrator and SSE broadcasts
**Objective:** Compose the new modules into the existing M6 engine and
broadcast contract-typed events.

**Files:**
- `apps/sync-engine/src/engine.ts` (modify)
- `apps/sync-engine/src/sse-hub.ts` (modify if event coverage gap exists)
- `apps/sync-engine/src/index.ts` (modify if startup wiring requires it)

**Actions:**
1. Extend the orchestrator with a single shared async mutex serializing
   commit, push, and pull operations against the local repo.
2. Wire the post-commit hook from M6's committer to invoke
   `pusher.pushOnce()`. On `pushed`, broadcast `synced`. On
   `rejected-non-ff`, trigger an immediate `puller.pullOnce()` and follow
   the pull branch below. On `network-failure`, hand off to the push
   retry scheduler and let `offline-state` decide whether to broadcast
   `offline`.
3. Wire the pull loop:
   - `up-to-date` → no event.
   - `fast-forwarded` → broadcast a `change` event per affected path
     (or one `change` event with a path array if that is what the M1
     contract specifies — verify against `packages/contracts`), then
     broadcast a single `synced`.
   - `cannot-fast-forward` → invoke `conflict-detector`; broadcast the
     resulting `conflict` event; transition engine state.
   - `network-failure` → hand off to pull retry scheduler.
4. Extend `getStatus()` to include `remote` info: `branch`,
   `redactedUrl`, `lastPullAt`, `lastPushAt`, `online`, `conflictPending`.
5. Confirm `sse-hub.broadcast` accepts each event variant of the contract
   union; if any tag is unhandled, add the case (no schema changes here).

**Rules:**
- Must never broadcast a raw simple-git error object; always normalize to
  the contract event shape.
- Must guarantee event ordering per repo: `change`* → `synced` for a
  successful pull; `conflict` is terminal until cleared.
- Must hold the mutex across the smallest unit possible (one git
  operation) to avoid blocking the SSE hub.

**Output:**
- An engine that performs full remote sync and surfaces all four contract
  events.

---

### Step 8: Extend test fixtures and harness
**Objective:** Provide deterministic local-bare-repo fixtures, a network
fault injector, and conflict seed helpers.

**Files:**
- `apps/sync-engine/test/fixtures/bare-remote.ts` (create)
- `apps/sync-engine/test/fixtures/network-fault.ts` (create)
- `apps/sync-engine/test/fixtures/conflict-seed.ts` (create)
- `apps/sync-engine/test/fixtures/engine-harness.ts` (modify — extend M6 harness
  to support remote-enabled mode)

**Actions:**
1. `bare-remote.ts`: create a temp directory, run `git init --bare`,
   clone it twice (one acts as the engine's working clone, one as a
   "remote collaborator" clone used to simulate external pushes), and
   yield handles plus cleanup.
2. `network-fault.ts`: provide a switch the puller/pusher consult before
   running git commands, allowing tests to force `network-failure`
   results without invoking real git. Implement as an injectable adapter
   around simple-git, swapped in via the harness.
3. `conflict-seed.ts`: helpers that, given the two clones, modify the
   same line of the same markdown file in each clone, commit both, and
   push the collaborator clone — yielding a state where the engine's
   next pull must produce `cannot-fast-forward`.
4. Extend the M6 harness to start the engine with `remote.enabled = true`
   pointing at the bare remote, expose collected SSE events with
   precise timestamps, and expose pull/push schedulers in test-mode (manual
   tick) to make assertions deterministic.

**Rules:**
- Must clean up all temp directories on teardown.
- Must not require network access; all tests run on local filesystem
  remotes.

**Output:**
- Reusable fixtures for each test scenario.

---

### Step 9: Author Vitest suites for remote sync
**Objective:** Cover the four required scenarios plus regression cases.

**Files:**
- `apps/sync-engine/test/push-roundtrip.test.ts` (create)
- `apps/sync-engine/test/pull-fast-forward.test.ts` (create)
- `apps/sync-engine/test/offline-retry.test.ts` (create)
- `apps/sync-engine/test/conflict-detection.test.ts` (create)
- `apps/sync-engine/test/event-ordering.test.ts` (create)
- `apps/sync-engine/test/token-redaction.test.ts` (create)

**Actions:**
1. `push-roundtrip.test.ts`: edit a tracked markdown file in the working
   clone's `contentDir`, allow watcher+committer to commit, advance the
   push scheduler, assert the bare remote contains the new SHA on the
   default branch, assert one `synced` event was broadcast.
2. `pull-fast-forward.test.ts`: have the collaborator clone push a new
   commit that adds and modifies files inside `contentDir`; advance the
   pull scheduler; assert the engine emitted one `change` event covering
   the affected paths followed by one `synced`; assert the working tree
   matches the collaborator's tree.
3. `offline-retry.test.ts`: enable network-fault for push; perform a local
   edit; assert engine emits `offline` (after debounce) and retains the
   commit locally; assert no `synced` is emitted while faulted; clear
   the fault; advance the push scheduler; assert `synced` is emitted and
   the bare remote receives the commit.
4. `conflict-detection.test.ts`: use `conflict-seed.ts` to produce
   divergent commits on the same line; advance the pull scheduler; assert
   exactly one `conflict` event is broadcast, validate its payload against
   the M1 contract schema (path list, base/local/remote SHAs, hunks for
   both sides), assert the working tree is unchanged, assert subsequent
   pull/push ticks are suspended until `clearConflictState()` is called.
5. `event-ordering.test.ts`: combine a remote fast-forward with an
   in-flight local edit; assert mutex serialization (no interleaved
   commit/pull SHAs) and that the `change → synced` invariant holds per
   pull cycle.
6. `token-redaction.test.ts`: configure a sentinel `GITHUB_TOKEN`; force a
   push failure that surfaces git stderr in an `offline` reason; assert
   the token does not appear in any broadcast event payload, status
   output, or log capture.

**Rules:**
- Must use Vitest only; must not start a browser; must not call real
  GitHub.
- Must drive schedulers in manual-tick mode; no `setTimeout`-based waits.
- Must assert against contract-typed event shapes (validate via the
  exported zod schema).

**Output:**
- A green `pnpm --filter sync-engine test` covering every M7 deliverable.

---

### Step 10: Update milestone command and documentation
**Objective:** Make the milestone runnable and self-explanatory.

**Files:**
- `apps/sync-engine/package.json` (modify — confirm `test` script covers
  the extended suite; no rename required)
- `apps/sync-engine/README.md` (modify)
- `package.json` at repo root (modify only if a verify alias is missing)

**Actions:**
1. Confirm `pnpm --filter sync-engine test` runs the entire `test/`
   directory including the new files.
2. In the README, document: the `GITHUB_TOKEN` env var (Fine-Grained PAT
   with `Contents: read/write`, `Metadata: read`); pull/push cadence and
   how to tune via env (`SYNC_ENGINE_REMOTE_PULL_INTERVAL_MS`, etc.); the
   four event types and when each fires; the offline contract; the fact
   that conflict resolution is deferred to M8.
3. Add a short "Local development against a bare remote" section linking
   to the test fixtures as the canonical recipe.

**Rules:**
- Must not document any token value; must reference the env var only.
- Must keep the file ≤ 400 lines (per AC-8).

**Output:**
- Verifiable milestone command and accurate operator documentation.

---

## 5. Data Model / Schema (if applicable)

**Internal type: `PullResult`**
- Discriminated union: `up-to-date` | `fast-forwarded` |
  `cannot-fast-forward` | `network-failure`.
- `fast-forwarded` carries `paths: string[]` (relative to repo root,
  filtered to `contentDir`), `fromSha`, `toSha`.
- `cannot-fast-forward` carries `localSha`, `remoteSha`.
- `network-failure` carries `reason: 'dns' | 'refused' | 'timeout' | 'tls'
  | 'auth' | 'http-5xx' | 'unknown'`.

**Internal type: `PushResult`**
- Discriminated union: `pushed` | `up-to-date` | `rejected-non-ff` |
  `network-failure`. Same `reason` taxonomy as `PullResult`.

**Internal type: `EngineRemoteStatus`**
- Fields: `branch`, `redactedUrl`, `online`, `conflictPending`,
  `lastPullAt`, `lastPushAt`, `nextPullAt`, `nextPushRetryAt`.

**Wire events (consumed from `packages/contracts`):**
- `change` — emitted per fast-forward (one event with affected paths, or
  N events; resolve per contract — see §9).
- `synced` — emitted after successful push and after a successful pull
  cycle that did no work changes.
- `offline` — emitted on classified network failure after debounce.
- `conflict` — emitted on `cannot-fast-forward` with `{ branch, baseSha,
  localSha, remoteSha, files: [{ path, localHunks, remoteHunks }] }`.

No persistent storage schema changes; git is the storage.

## 6. Use Case Implementation

**Use Cases Covered:**
- UC-1 (sync-engine online path): post-commit push → `synced`; push
  failure → `offline` + retain commit locally + retry.
- UC-2 (reconnect path): on engine restart with pending unpushed commits,
  the push scheduler drives them out; emits `synced` once caught up.
- UC-4 (remote pull, both branches): periodic pull → fast-forward →
  `change` + `synced`; non-FF → `conflict` event with hunks. Resolution
  surface deferred to M8.

**Layer Responsibility:**
- This milestone provides **only** the sync-engine's remote behavior and
  event emissions. It does not change provider HTTP, sidecar persistence,
  or UI. UI and provider rebinding remain UC-6's concern (M5).

**Interface Notes:**
- The engine consumes the `change` and `conflict` event shapes from
  `packages/contracts` exactly as defined in M1; this plan does not
  redefine them. If M1's `change` is single-path-per-event, the puller
  emits N events; if it is `paths: string[]`, the puller emits one. See
  §9.

## 7. Validation & Verification
- Step 1 verified by config-load tests asserting env precedence and that
  the public config serialization omits the token.
- Step 2 verified by unit tests on `remote-config.ts`: HTTPS remotes
  accepted, SSH rejected, redaction never leaks the token.
- Step 3 verified by `pull-fast-forward.test.ts` and the
  `cannot-fast-forward` branch in `conflict-detection.test.ts`.
- Step 4 verified by `push-roundtrip.test.ts` and the `rejected-non-ff`
  path exercised inside `conflict-detection.test.ts`.
- Step 5 verified by `conflict-detection.test.ts` validating payload
  against the contract schema and asserting working-tree immutability.
- Step 6 verified by `offline-retry.test.ts` asserting debounce, retry
  cadence, and one-`synced`-per-recovery.
- Step 7 verified by `event-ordering.test.ts` and the suite at large.
- Steps 8–9 verified by green `pnpm --filter sync-engine test`.
- Step 10 verified by manually inspecting README and confirming the
  command runs from a clean checkout per AC-11.

## 8. Rollback Strategy
- All changes are additive within `apps/sync-engine/` and contract
  consumption from `packages/contracts`. Reverting M7 leaves M6 (watcher
  + auto-commit + SSE) intact: disable the `remote.enabled` flag and the
  engine returns to local-only behavior with no schema migrations.
- No data migrations; git history is the only persistent state, and M7
  introduces no new on-disk artifacts beyond commits the user already
  authored.
- If a regression escapes to a real remote (force-push is forbidden so
  this should be impossible), the standard `git reset` recovery on the
  affected clone applies; no engine-side undo step is required.

## 9. Open Questions
- **`change` event cardinality for pulls:** does the M1 contract's
  `change` carry `path: string` (one event per file) or `paths: string[]`
  (one event per pull)? Implementer must inspect
  `packages/contracts` and conform; both shapes are supportable.
- **Conflict `hunks` representation:** unified-diff text vs. structured
  `{ oldStart, oldLines, newStart, newLines, lines: string[] }`. The
  contract from M1 is authoritative; if under-specified, default to
  unified-diff text and raise to M8 planner.
- **Pull suspension during conflict-pending:** confirmed suspended here;
  M8 must define the resume signal (resolution-applied event) so the
  scheduler can restart.
- **Branch handling beyond default:** this milestone tracks only the
  default branch; multi-branch sync is out of scope and not currently
  flagged elsewhere.
- **PAT rotation:** behavior on a rotated/expired token (currently
  classified as `network-failure` with reason `auth` → `offline`). A
  dedicated `auth-failed` event may be warranted in a later milestone.

## 10. References
- simple-git — https://github.com/steveukx/git-js
- simple-git API docs — https://github.com/steveukx/git-js/blob/main/docs/
- GitHub Fine-Grained PAT —
  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- GitHub HTTPS auth with token (`x-access-token`) —
  https://docs.github.com/en/get-started/git-basics/about-remote-repositories#cloning-with-https-urls
- GitHub Contents/Metadata permissions reference —
  https://docs.github.com/en/rest/overview/permissions-required-for-fine-grained-personal-access-tokens
- Git `merge --ff-only` — https://git-scm.com/docs/git-merge
- Vitest — https://vitest.dev/guide/
- Vitest fake timers — https://vitest.dev/api/vi.html#vi-usefaketimers
- Main plan — `ai-docs/awesome-markdown-main.md` (see §5 UC-1/UC-2/UC-4,
  §6 AC-5/AC-6/AC-11, §9 Resolved Decisions)
- Prior milestone — `ai-docs/awesome-markdown-m6.md`
