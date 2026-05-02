# Implementation Plan: github-app-webhook

## 0. Metadata
- **Complexity:** 4
- **Uncertainty:** 2
- **Work:** 3
- **Scope:** Replace the sync-engine's 30-second `git fetch` polling loop with a push-based GitHub App webhook delivery, and migrate git remote authentication from a Personal Access Token to GitHub App installation tokens. Polling is retained as a slow safety-net only.
- **Non-goals:**
  - No UI changes in `kanban-ui` (existing SSE `change` events remain the only UI signal).
  - No support for events other than `push` on the configured target branch.
  - No multi-repo / multi-installation orchestration; single installation, single repo.
  - No managed deployment topology — Coder workspace public proxy is the only supported delivery path; production hosting is out of scope.
  - No automatic GitHub App registration — operator creates the App manually and configures `.env`.
  - No replay/persistence of webhook deliveries beyond what GitHub itself retains.

## 1. Problem Statement

The sync-engine currently discovers external (remote) changes by running `git fetch` on a fixed interval (default 30 s, min 2 s) via `RetryScheduler`, which is wasteful, slow to react, and consumes API quota. External changes published from another machine or PR merge can take up to 30 s to appear. The remote credential is also a long-lived `GITHUB_TOKEN` PAT, which is broader than needed and harder to rotate than GitHub App installation tokens.

## 2. Constraints & Assumptions

- Sync-engine continues to run as a single Node process on the developer's Coder workspace, listening on `127.0.0.1:7402`.
- The Coder workspace exposes a public HTTPS proxy URL pointing at port `7402`; the operator pastes this URL into the GitHub App webhook configuration.
- All GitHub App credentials (`APP_ID`, `PRIVATE_KEY`, `INSTALLATION_ID`, `WEBHOOK_SECRET`) live in `apps/sync-engine/.env`. `.env` is gitignored; `.env.example` documents shape only.
- The GitHub App private key is loaded from a file path (`GITHUB_APP_PRIVATE_KEY_PATH`) **or** an inlined PEM string (`GITHUB_APP_PRIVATE_KEY`); the private key never leaves the sync-engine process.
- Installation access tokens (1-hour TTL) replace the PAT for `git fetch` / `git push`. The token cache refreshes ≥ 5 minutes before expiry.
- Webhook signature verification uses `X-Hub-Signature-256` (HMAC-SHA256) with constant-time comparison.
- Polling is kept as a safety net at a slow cadence (default 10 minutes, min 60 s) for the case where webhook delivery is missed (Coder proxy down, GitHub outage, app uninstalled).
- Existing test infrastructure (Vitest, fault injectors `PullFault` / `PushFault`) is reused. Webhook handler ships with its own unit tests.
- The committer/pusher pipeline, conflict detection, SSE hub, and retry/offline state machines remain untouched in behavior; only the *trigger* and the *credential source* change.

## 3. Target State (Definition of Done)

**Functional:**
- A GitHub `push` event on the configured target branch causes the sync-engine to perform exactly one pull within ≤ 5 s of GitHub's delivery, emitting `change` SSE events as today.
- Pushes from other branches or non-`push` event types are accepted, signature-verified, and ignored without triggering a pull.
- `git fetch` and `git push` use a freshly-minted GitHub App installation token; the legacy `GITHUB_TOKEN` PAT is no longer read.
- The slow polling fallback runs at ≥ 5 min cadence and still works when the webhook is misconfigured or unreachable.
- Webhook deliveries with invalid or missing signatures are rejected with HTTP 401 and never trigger a pull.
- Sync-engine starts cleanly with webhook disabled (no App credentials configured) and falls back to existing polling-only behavior.

**Non-functional:**
- Webhook handler responds with HTTP 202 in ≤ 1 s; pull work runs asynchronously through the existing mutex-serialized worker.
- No App credential, JWT, or installation token is ever logged at any log level.
- Constant-time comparison is used for signature verification.
- The webhook route file and the App-auth module each stay ≤ 400 lines.

**Success Criteria:**
- [ ] `pnpm typecheck && pnpm lint` pass at workspace root.
- [ ] All existing sync-engine Vitest suites still pass.
- [ ] New tests cover: signature verification (good / bad / missing), event filtering (push on target / push on other / non-push), App token minter (cache hit, cache expiry, mint failure), polling-cadence floor.
- [ ] Manual end-to-end check: pushing a commit to the target branch from another machine triggers a UI `change` event in `kanban-ui` within 5 s, observed via `agent-browser` against `apps/kanban-ui`.
- [ ] `apps/sync-engine/README.md` documents the GitHub App setup, Coder proxy public URL step, and the new env vars.
- [ ] `GITHUB_TOKEN` is removed from `.env.example`, runtime config, and code paths.

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `apps/sync-engine/src/github-app/` (new dir) | New | GitHub App auth module: JWT minting, installation-token cache, `getGitCredentials()` accessor used by `remote-config`. |
| `apps/sync-engine/src/http/webhook-routes.ts` (new) | New | Fastify webhook receiver. Verifies `X-Hub-Signature-256`, filters event/branch, schedules a single pull via the existing remote worker. |
| `apps/sync-engine/src/remote-config.ts` | Modify | `getAuthenticatedUrl()` becomes async and pulls a fresh installation token from the App-auth module instead of reading `GITHUB_TOKEN`. |
| `apps/sync-engine/src/puller.ts`, `pusher.ts`, `remote-worker.ts` | Modify | Adjust call sites for the now-async `getAuthenticatedUrl()`. Add a `triggerPullNow()` entrypoint exposed to the webhook route. |
| `apps/sync-engine/src/engine.ts` | Modify | Expose `triggerPullNow()` on `Engine`; raise default polling interval; cancel polling cleanly when webhook is enabled-and-healthy is **not** required (slow polling always runs as fallback). |
| `apps/sync-engine/src/config.schema.ts` | Modify | New `githubApp` section (`appId`, `installationId`, `privateKey`/`privateKeyPath`, `webhookSecret`, `enabled`). Raise `pullIntervalMs` default to 600000 (10 min) and bump min to 60000. |
| `apps/sync-engine/src/config.ts` | Modify | Map new env vars: `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_APP_WEBHOOK_SECRET`. Drop `GITHUB_TOKEN`. |
| `apps/sync-engine/src/server.ts` | Modify | Mount webhook routes when App config is present; otherwise log a warning and skip. |
| `apps/sync-engine/src/types.ts` | Modify | Extend `EngineConfig['remote']` shape; add `triggerPullNow()` to public Engine surface. |
| `apps/sync-engine/.env.example` | Modify | Replace `GITHUB_TOKEN` block with the GitHub App block; add Coder proxy URL note. |
| `apps/sync-engine/package.json` | Modify | Add minimal deps: `@octokit/auth-app` (token minting) and `@octokit/webhooks-methods` (signature verify) — or hand-roll with `node:crypto` to avoid deps; final choice deferred to milestone 1 (see Open Questions). |
| `apps/sync-engine/README.md` | Modify | Document App registration, permissions, webhook URL, secret, polling fallback. |
| `.github/copilot-instructions.md` | Modify | Update the "Git auth" row in the tech-stack table; update the env-vars row for sync-engine. |
| `apps/sync-engine/test/` | New | New suites: `webhook.routes.test.ts`, `webhook.signature.test.ts`, `github-app.token.test.ts`. Update `remote-config.test.ts` and any tests that hard-code `GITHUB_TOKEN`. |

## 5. Use Cases

### UC-1: External push triggers immediate pull
**Actor:** GitHub (delivering a webhook)
**Trigger:** A `push` event lands on the configured target branch in the linked repo.
**Flow:**
1. GitHub `POST`s the event JSON + `X-Hub-Signature-256` to the sync-engine's public webhook URL.
2. Sync-engine verifies the signature against `GITHUB_APP_WEBHOOK_SECRET` using constant-time HMAC-SHA256.
3. Sync-engine inspects the event type (`X-GitHub-Event`) and `ref`; only `push` on `refs/heads/<targetBranch>` proceeds.
4. Sync-engine acknowledges with HTTP 202 immediately.
5. Sync-engine asynchronously calls `Engine.triggerPullNow()`, which executes one mutex-serialized `pullTask` using a freshly-minted installation token.
6. `pullTask` produces SSE events (`change` / `synced` / `offline`) on the existing hub exactly as the polling path does today.

**Input:** Raw HTTP request body, `X-Hub-Signature-256`, `X-GitHub-Event`, `X-GitHub-Delivery` headers.
**Output:** HTTP 202 to GitHub; SSE `change` events to subscribed UI clients (when commits arrive).
**Errors:**
- Missing/invalid signature → HTTP 401, no pull, no SSE.
- Non-`push` event or wrong branch → HTTP 202, no pull.
- Pull network failure → existing offline state machine handles it; polling fallback still runs.

### UC-2: Slow polling backstops missed deliveries
**Actor:** Sync-engine internal scheduler
**Trigger:** Configured `pullIntervalMs` (default 10 min) elapses since last successful pull.
**Flow:**
1. Polling tick fires through the existing `RetryScheduler` / `pullTask` path.
2. Installation token is fetched (cache hit if < 55 min old).
3. Pull executes; if remote is up-to-date, no SSE is emitted.

**Input:** Wall-clock interval.
**Output:** Same SSE event surface as UC-1.
**Errors:** Same as today's polling path.

### UC-3: Operator boots sync-engine without GitHub App
**Actor:** Developer
**Trigger:** `apps/sync-engine/.env` has no `GITHUB_APP_*` vars set; only the legacy local-only path is desired.
**Flow:**
1. Sync-engine starts; config validation produces `remote.enabled = false`.
2. Webhook route is **not** mounted; pull/push schedulers do not start.
3. Engine runs the watcher → debouncer → committer → SSE chain only (no remote sync).

**Input:** Env file without GitHub App credentials.
**Output:** Sync-engine running locally with no remote operations and no webhook endpoint.
**Errors:** None — this is the local-only baseline.

### UC-4: Token expiry during long-running session
**Actor:** Sync-engine internal token cache
**Trigger:** Cached installation token is within 5 minutes of its 1-hour expiry when a pull or push is requested.
**Flow:**
1. Token cache detects `expiresAt - now < 5 min`.
2. Cache mints a new JWT (signed with the App private key, 9-minute TTL).
3. Cache `POST`s to `/app/installations/{installationId}/access_tokens` and stores the new token + expiry.
4. Caller (`pullOnce` / `pushOnce`) receives the fresh token via `getAuthenticatedUrl()`.

**Input:** Current time.
**Output:** Fresh `https://x-access-token:<token>@github.com/owner/repo.git` URL.
**Errors:** Token mint failure surfaces as a `NetworkFailureReason` of `auth`, feeding into the existing offline state machine.

### Contracts

**Contract: `GitCredentialProvider`**
- **Provider:** `apps/sync-engine/src/github-app/` (token cache)
- **Consumer:** `remote-config.ts` (`getAuthenticatedUrl()`)
- **Shape:** `getInstallationToken(): Promise<{ token: string; expiresAt: Date }>` — returns a non-expired installation access token. Internally caches and refreshes; never returns a token within 5 min of expiry.

**Contract: `WebhookTrigger`**
- **Provider:** `apps/sync-engine/src/engine.ts`
- **Consumer:** `apps/sync-engine/src/http/webhook-routes.ts`
- **Shape:** `triggerPullNow(reason: { deliveryId: string; commitSha?: string }): void` — fire-and-forget; enqueues at most one extra pull while another is in flight (coalescing).

## 6. Milestones

### Milestone 1: GitHub App auth & installation-token cache
**Objective:** Replace the `GITHUB_TOKEN` PAT with a minted installation access token, transparently to all callers of `getAuthenticatedUrl()`.

**Deliverables:**
- New `apps/sync-engine/src/github-app/` module providing `GitCredentialProvider`.
- Config schema additions for `githubApp.{appId, installationId, privateKey, privateKeyPath}`.
- `remote-config.ts` updated to consume the new provider; `getAuthenticatedUrl()` becomes async.
- All call sites in `puller.ts`, `pusher.ts`, `remote-worker.ts` updated.
- Unit tests covering: cache hit, cache near-expiry refresh, mint failure → `NetworkFailureReason: 'auth'`, missing config → friendly startup error.
- `.env.example` and `apps/sync-engine/README.md` updated.
- `GITHUB_TOKEN` references removed across the workspace.

**Use Cases:** UC-3, UC-4 (full); UC-1 and UC-2 (credential portion only).

**Complexity:** 3 | **Work:** 3

---

### Milestone 2: Webhook receiver & immediate-pull trigger
**Objective:** Add a signature-verified webhook endpoint that triggers a single pull within seconds of a GitHub `push` to the target branch.

**Deliverables:**
- New `apps/sync-engine/src/http/webhook-routes.ts` Fastify plugin (`FastifyPluginAsyncZod`).
- Constant-time HMAC-SHA256 signature verification on the **raw** request body (Fastify raw-body wiring required).
- Event filtering: only `push` events on `refs/heads/<targetBranch>` proceed.
- New `Engine.triggerPullNow()` with single-flight coalescing.
- `server.ts` mounts the webhook route only when `githubApp.enabled` is true.
- Tests: signature good/bad/missing, event-type filter, branch filter, coalescing under burst, 202 latency budget.
- README adds Coder proxy public-URL setup steps and webhook configuration walkthrough.

**Use Cases:** UC-1 (full).

**Complexity:** 3 | **Work:** 3

---

### Milestone 3: Polling cadence change & cleanup
**Objective:** Demote the polling loop to a slow safety net and remove documentation/code that treats it as the primary trigger.

**Deliverables:**
- `config.schema.ts`: raise `pullIntervalMs` default to 600000 (10 min); raise `min` to 60000 (1 min).
- Update `apps/sync-engine/README.md` and `.github/copilot-instructions.md` to describe webhook as the primary trigger and polling as fallback.
- Update existing tests that assume the 30 s default.
- Verify offline-state and conflict-pending guards still gate the slow polling path correctly.

**Use Cases:** UC-2.

**Complexity:** 1 | **Work:** 1

## 7. Validation & Verification

- **Unit (Vitest):** signature verification fixtures from GitHub's published test vector; token-cache time mocking; event/branch filter table.
- **Integration (Vitest):** `webhook.routes.test.ts` builds a Fastify app with a fake `triggerPullNow` spy and asserts coalescing + 202 response shape.
- **Manual (`agent-browser`):** Boot all services, configure App + webhook against a sandbox repo, push a commit from another worktree, confirm `kanban-ui` reflects the change without waiting for the polling cadence. Capture annotated screenshot.
- **Regression:** Re-run `pnpm test` (all packages) and `pnpm verify:ui` to confirm no behavior regression in committer / conflict / SSE paths.

## 8. Rollback Strategy

- Each milestone lands behind its own commit on a feature branch and PR.
- The slow-polling fallback (Milestone 3) means even if the webhook path is later disabled (env vars removed), the engine still syncs — at slower cadence — without code changes.
- Reverting Milestone 1 requires reinstating `GITHUB_TOKEN` env handling; this would be a single revert commit on `remote-config.ts` plus deps, since the call sites would still type-check (sync vs async) but require the prior signature.
- No database / on-disk schema migrations are introduced; rollback does not require data fixup.

## 9. Open Questions

- **Library choice for App auth:** `@octokit/auth-app` vs hand-rolled JWT (using `jsonwebtoken` or `node:crypto`'s `createSign`). Hand-rolled keeps deps minimal but adds code surface; resolved during Milestone 1 spike. Tooling: webhook signature verification can use either `@octokit/webhooks-methods` or a 15-line `node:crypto.timingSafeEqual` helper.
- **Coder proxy URL stability:** The public proxy URL may change across workspace rebuilds. Plan assumes the operator updates the GitHub App webhook URL when this happens; not automated.
- **Installation discovery:** Whether to require operator-provided `INSTALLATION_ID` (current plan) or auto-discover via `GET /repos/{owner}/{repo}/installation` on startup. Current plan: operator-provided for simplicity; auto-discovery is a future enhancement.
- **Multiple-event coalescing window:** When several pushes arrive in a burst, how aggressively to coalesce. Initial plan: at most one extra queued pull while one runs; finer tuning deferred.

## 10. References

- GitHub App authentication as installation: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- Generating a JWT for a GitHub App: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
- Validating webhook deliveries: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- `push` event payload: https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
- Fastify v5 raw body / content type parsers: https://fastify.dev/docs/latest/Reference/ContentTypeParser/
- `@octokit/auth-app`: https://github.com/octokit/auth-app.js
- `@octokit/webhooks-methods`: https://github.com/octokit/webhooks.js

**Review Checkpoint:** After creating this main plan, pause for user review before generating detailed milestone files.
