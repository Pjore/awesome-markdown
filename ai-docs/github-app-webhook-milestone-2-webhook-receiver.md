# Milestone Plan: Webhook receiver & immediate-pull trigger

## 0. Metadata
- **Milestone:** 2 of 3
- **Complexity:** 3
- **Uncertainty:** 2
- **Work:** 3
- **Estimated Files:** ~10 (1 new route plugin, 1 new helper, edits to engine/server/types/README, 3 new test files, 1 updated test)
- **Scope:** Add a signature-verified GitHub webhook receiver to the sync-engine and a single-flight `Engine.triggerPullNow()` entrypoint that runs one mutex-serialized pull per push delivery on the configured target branch. Slow polling continues unchanged as a fallback.
- **Non-goals:**
  - No changes to credential minting (delivered in Milestone 1).
  - No changes to polling cadence (delivered in Milestone 3).
  - No persistence or replay of webhook deliveries beyond GitHub's own retention.
  - No support for non-`push` events.
  - No multi-installation or multi-repo handling.
  - No UI changes in `kanban-ui`.
- **Dependencies:**
  - Milestone 1 (`GitCredentialProvider`, `githubApp` config block, async `getAuthenticatedUrl()`).
  - Existing `Engine.mutex`, `RetryScheduler`, `pullTask` worker, `SseHub`.

## 1. Problem Statement

The sync-engine currently learns about external pushes only through periodic polling. After Milestone 1, the credential side of GitHub App support exists, but the engine still cannot react to a push within seconds. This milestone introduces the inbound webhook surface, the signature-verification boundary, the event/branch filter, and the `triggerPullNow()` entrypoint that funnels a verified delivery into exactly one mutex-serialized pull.

## 2. Constraints & Assumptions

- The webhook handler must respond with HTTP 202 in ≤ 1 s; pull work is fire-and-forget and runs through the existing remote worker.
- Signature verification uses `X-Hub-Signature-256` (HMAC-SHA256) with constant-time comparison computed against the **raw** request body bytes — JSON-parsed bodies cannot be re-serialized for verification.
- Library choice (recorded here, not deferred): hand-rolled signature verification using `node:crypto.createHmac` + `node:crypto.timingSafeEqual`. Rationale: ~15 lines of code, zero new runtime dependencies, no abstraction over the Node primitive needed.
- Fastify v5 raw-body wiring: a custom `application/json` content-type parser is registered on the webhook route's encapsulated plugin scope only, so other JSON routes (conflict, status) are unaffected.
- Invalid/missing/mis-typed signature → HTTP 401, no pull, no SSE.
- Non-`push` events or pushes to refs other than `refs/heads/<targetBranch>` → HTTP 202, no pull.
- Single-flight coalescing: while one pull is in flight, at most one additional pull may be queued. A burst of N deliveries collapses to ≤ 2 pulls (current + at-most-one-queued).
- The webhook route mounts only when `config.githubApp.enabled === true`. Absence of credentials means no public surface area.
- No App credentials, JWT, installation token, or webhook secret may appear in logs at any level. Log lines reference the GitHub `X-GitHub-Delivery` UUID instead.
- File length: webhook route file ≤ 400 lines; helper file ≤ 400 lines.
- Webhook listener binds to the same `127.0.0.1:7402` Fastify instance; the public surface is provided by the Coder workspace HTTPS proxy. No TLS terminated by the engine itself.
- The webhook secret is sourced from `config.githubApp.webhookSecret` (already added to the schema in Milestone 1). If the value is empty when `githubApp.enabled === true`, startup fails with a clear error.

## 3. Deliverables (Definition of Done)

- [ ] New file `apps/sync-engine/src/http/webhook-routes.ts` (`FastifyPluginAsyncZod`) verifies signatures, filters events/branches, and calls `engine.triggerPullNow()`.
- [ ] New helper file `apps/sync-engine/src/http/webhook-signature.ts` exposes a constant-time HMAC-SHA256 verifier accepting the raw body buffer and the `X-Hub-Signature-256` header value.
- [ ] `Engine.triggerPullNow(reason)` exists, is fire-and-forget, single-flight-coalesced, and reuses the existing mutex-serialized `pullTask` worker.
- [ ] `apps/sync-engine/src/server.ts` mounts the webhook route only when `config.githubApp.enabled === true`.
- [ ] Webhook route does not mount when GitHub App config is absent or disabled (verified by test).
- [ ] New tests `webhook.signature.test.ts`, `webhook.routes.test.ts`, `trigger-pull-now.test.ts` cover all rejection and success paths plus coalescing and 202 latency.
- [ ] `apps/sync-engine/README.md` documents Coder proxy public-URL setup, GitHub App webhook URL configuration, secret pairing, and the `application/json` content-type requirement.
- [ ] `pnpm --filter sync-engine typecheck`, `pnpm lint`, and `pnpm --filter sync-engine test` all pass.
- [ ] No App credential, JWT, installation token, or webhook secret appears in any log output (verified by extension to existing `token-redaction.test.ts` or new assertion in `webhook.routes.test.ts`).
- [ ] Webhook handler responds with HTTP 202 in under 1 s in all success-shaped paths (asserted as a wall-clock budget in tests using Fastify `inject`).

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `apps/sync-engine/src/http/webhook-routes.ts` | New | Fastify plugin defining `POST /webhooks/github`. Registers an encapsulated raw-body `application/json` content-type parser, runs signature verification, filters event/branch, calls `triggerPullNow()`, returns 202 with a small JSON envelope. |
| `apps/sync-engine/src/http/webhook-signature.ts` | New | Pure function `verifyGitHubSignature(rawBody: Buffer, header: string \| undefined, secret: string): boolean`. Constant-time HMAC-SHA256 compare; returns false on missing/malformed header. No throws on bad input. |
| `apps/sync-engine/src/engine.ts` | Modify | Add public `triggerPullNow(reason)` method with single-flight coalescing; add private state (`pullInFlight: boolean`, `pullQueued: boolean`) to back the coalescing rule. Reuse existing `mutex` and `_pullTask()` to execute. Existing `triggerPull()` test helper remains unchanged. |
| `apps/sync-engine/src/types.ts` | Modify | Add `triggerPullNow(reason: WebhookTriggerReason): void` to the engine's public-surface type (or via direct `Engine` class export); define `WebhookTriggerReason` interface (`{ deliveryId: string; commitSha?: string }`). |
| `apps/sync-engine/src/server.ts` | Modify | Import `mountWebhookRoutes`; conditionally mount when `config.githubApp?.enabled === true`. Pass `engine`, `webhookSecret`, and `targetBranch` into the route context. |
| `apps/sync-engine/README.md` | Modify | New "Webhook setup" section: Coder proxy URL discovery, GitHub App webhook URL field, secret pairing with `GITHUB_APP_WEBHOOK_SECRET`, content-type set to `application/json`, event subscription = `push` only, troubleshooting (401 → secret mismatch, 202 with no pull → wrong branch). |
| `apps/sync-engine/test/webhook.signature.test.ts` | New | Pure unit tests for the signature verifier (good fixture, bad signature, missing header, malformed prefix, wrong digest length, empty body). |
| `apps/sync-engine/test/webhook.routes.test.ts` | New | Fastify `inject` integration tests against the route plugin with a stub `triggerPullNow` spy and a fake clock for the 202 latency budget. |
| `apps/sync-engine/test/trigger-pull-now.test.ts` | New | Tests `Engine.triggerPullNow()` coalescing semantics with a stubbed `pullTask` and the real `Mutex`. |
| `apps/sync-engine/test/config.test.ts` | Modify | Add a case asserting that `githubApp.enabled === true` with empty `webhookSecret` is rejected at config load (if not already covered in Milestone 1). |

## 5. Use Case Implementation

**Use Cases Covered:**
- UC-1 (full): External push triggers immediate pull. This milestone provides the entire receive-→-verify-→-filter-→-trigger path and the `triggerPullNow()` consumer surface.

**Layer Responsibility:**
- HTTP layer (`webhook-routes.ts`): authenticates the delivery, classifies it, and either rejects or forwards. Owns no domain state.
- Helper (`webhook-signature.ts`): pure cryptographic comparison. No I/O.
- Engine (`engine.ts`): owns coalescing state and delegates to the existing mutex-serialized pull worker. Emits no new SSE events; existing `change`/`synced`/`offline` events on the hub remain the only UI signal.

**Contract: `WebhookTrigger`**
- **Provider:** `apps/sync-engine/src/engine.ts` (method `Engine.triggerPullNow`)
- **Consumer:** `apps/sync-engine/src/http/webhook-routes.ts`
- **Shape:** `triggerPullNow(reason: { deliveryId: string; commitSha?: string }): void`
- **Semantics:**
  - Fire-and-forget. Returns synchronously after enqueuing intent.
  - Single-flight coalescing: while a pull is in flight, at most one additional pull may be queued. Subsequent calls during in-flight + queued state are dropped silently (the queued pull will re-fetch the latest remote state when it runs).
  - Errors during the pull are handled by the existing offline-state machine; `triggerPullNow` itself never throws.
  - `reason.deliveryId` is logged once per call to aid operator tracing; `reason.commitSha` is optional and informational.

**Interface Notes:**
- The webhook route reads `commitSha` from the parsed event payload's `after` field when present, but it is not required for correctness. Filter decisions depend only on `X-GitHub-Event` and the payload's `ref` field.

## 6. Step-by-Step Execution Plan

### Step 1: Add the signature-verification helper
**Objective:** Provide a side-effect-free, constant-time HMAC-SHA256 verifier usable by the route and unit-testable in isolation.

**Files:**
- `apps/sync-engine/src/http/webhook-signature.ts` (create)

**Actions:**
1. Create the helper file exporting a single named function that takes `rawBody: Buffer`, `signatureHeader: string | undefined`, `secret: string`, and returns `boolean`.
2. Define rejection cases (return `false`) for: undefined header, header not starting with the `sha256=` prefix, hex tail of the wrong byte length, or constant-time mismatch.
3. Use `node:crypto.createHmac` to compute the expected digest over the raw body buffer, then `node:crypto.timingSafeEqual` to compare equal-length buffers.
4. Add a brief module doc block referencing the GitHub "Validating webhook deliveries" page.

**Rules:**
- Must not throw on any input.
- Must not log or expose the secret in any error path.
- Must accept `Buffer` only (callers pass the raw body buffer; do not re-stringify).

**Output:**
- Pure helper function ready for unit tests.

---

### Step 2: Add unit tests for the signature helper
**Objective:** Lock down verifier behavior before wiring it into the route.

**Files:**
- `apps/sync-engine/test/webhook.signature.test.ts` (create)

**Actions:**
1. Add a Vitest suite that imports the helper.
2. Cover: valid signature for a known body+secret pair (computed once in the test as the source of truth), tampered body, tampered signature, missing header, malformed prefix, truncated digest, empty body with valid secret, empty secret.
3. Use a fixed body and secret pair generated inside the test to avoid coupling to any specific GitHub fixture.

**Rules:**
- Must not perform network I/O.
- Must not import the route plugin.

**Output:**
- All branches of the helper covered.

---

### Step 3: Add `triggerPullNow()` and coalescing state on `Engine`
**Objective:** Provide the contract surface the webhook route will call, with single-flight coalescing.

**Files:**
- `apps/sync-engine/src/engine.ts` (modify)
- `apps/sync-engine/src/types.ts` (modify)

**Actions:**
1. In `types.ts`, add an exported `WebhookTriggerReason` type (`deliveryId: string`, optional `commitSha: string`).
2. In `engine.ts`, add private fields tracking in-flight and queued pull state for the webhook path, distinct from the polling scheduler so polling and webhook do not interfere.
3. Add a public method `triggerPullNow(reason: WebhookTriggerReason): void` that:
   - Returns immediately after recording intent.
   - If a pull is not in flight, marks in-flight and runs `_pullTask()` via the existing mutex; on completion, if a queued flag is set, clears the queue and runs another pull; otherwise clears in-flight.
   - If a pull is already in flight, sets the queued flag (idempotent — a second concurrent call while queued is a no-op).
   - Catches and swallows any rejection from `_pullTask()` (offline-state machine already handles failures).
4. Log at info level once per invocation with the delivery ID; log at debug level on coalescing drop. Never log secrets, tokens, or payloads.
5. Ensure the existing test-only `triggerPull()` method continues to work and is not removed.

**Rules:**
- Must reuse the existing `mutex` and `_pullTask()` implementation; do not duplicate pull logic.
- Must not interact with the polling scheduler's `manualTick()` (avoids double counting).
- Must remain fire-and-forget (synchronous return; no `Promise` returned).
- Must not emit new SSE event types.

**Output:**
- `Engine.triggerPullNow` ready to be called from the route.

---

### Step 4: Add unit tests for `triggerPullNow()` coalescing
**Objective:** Verify single-flight semantics independently of HTTP.

**Files:**
- `apps/sync-engine/test/trigger-pull-now.test.ts` (create)

**Actions:**
1. Construct an `Engine` with a stub remote configuration and inject a controllable pull fault that lets the test resolve the in-flight pull on demand.
2. Assert: a single call runs exactly one pull; two rapid calls run exactly two pulls (first runs, second is queued and runs next); five rapid calls during one in-flight pull collapse to exactly one queued pull (total = 2 pulls); calls received after the queued pull starts but before it completes increment to one queued again.
3. Assert that `triggerPullNow` returns synchronously (does not return a `Promise`).
4. Assert that an exception inside `_pullTask` does not bubble out of `triggerPullNow`.

**Rules:**
- Must not depend on real timers; use deterministic resolvers.
- Must not depend on the route plugin.

**Output:**
- Coalescing semantics locked.

---

### Step 5: Implement the webhook Fastify plugin
**Objective:** Receive, verify, filter, and forward GitHub deliveries.

**Files:**
- `apps/sync-engine/src/http/webhook-routes.ts` (create)

**Actions:**
1. Export `mountWebhookRoutes` (or a `FastifyPluginAsyncZod` plugin function) that takes a context object containing: `engine` reference, `webhookSecret`, `targetBranch`, and an optional logger.
2. Inside the plugin scope, register a custom `application/json` content-type parser that preserves the raw body buffer (e.g. attach the buffer to the request before invoking JSON parsing). The parser must be encapsulated to this plugin so other JSON routes are unaffected.
3. Define `POST /webhooks/github` with a Zod schema for headers (`x-hub-signature-256`, `x-github-event`, `x-github-delivery`) and a permissive body schema (the body is validated by signature + structure check, not by Zod, because GitHub may add fields).
4. Handler steps in order:
   1. Read the raw body buffer attached by the parser; if missing, reply 400.
   2. Call the signature verifier with the raw body, the `x-hub-signature-256` header, and the configured secret. On failure, reply 401 with a small JSON envelope `{ ok: false, reason: "signature" }` and return.
   3. Branch on `x-github-event`:
      - `ping` → reply 202 with `{ ok: true, action: "ping" }`.
      - `push` → continue.
      - other → reply 202 with `{ ok: true, action: "ignored", reason: "event-type" }`.
   4. Parse the JSON body once (now that signature is verified) and read `ref`. If `ref !== "refs/heads/" + targetBranch`, reply 202 with `{ ok: true, action: "ignored", reason: "branch" }`.
   5. Call `engine.triggerPullNow({ deliveryId, commitSha })` where `commitSha` is the body's `after` field if present and a non-empty string.
   6. Reply 202 with `{ ok: true, action: "queued" }`.
5. Log at info level: delivery ID, event, branch decision, action taken. Never log the body contents, signature, or secret.

**Rules:**
- Must respond before awaiting any work that depends on the engine's mutex.
- Must use constant-time comparison only via the helper from Step 1.
- Must not parse the body twice (parse once, after signature is verified, for filtering).
- Must keep total file length ≤ 400 lines.
- Must never throw out of the handler; surface unexpected errors as 500 with no payload detail.

**Output:**
- Mountable webhook route.

---

### Step 6: Mount the webhook route conditionally in `server.ts`
**Objective:** Expose the route only when GitHub App support is enabled.

**Files:**
- `apps/sync-engine/src/server.ts` (modify)

**Actions:**
1. After the conflict routes mount, check `config.githubApp?.enabled === true` and the presence of a non-empty `webhookSecret`.
2. When the check passes, call `mountWebhookRoutes` with `engine`, `webhookSecret`, and the resolved `targetBranch`.
3. When the check fails, log an info-level line stating that the webhook receiver is not active (no secrets in the message).
4. Do not change the order of existing route mounts.

**Rules:**
- Must not register the raw-body parser globally on the Fastify instance; it must be scoped to the plugin in Step 5.
- Must remain a single conditional block (no duplicate mounts).

**Output:**
- `server.ts` boots either with or without the webhook route based on config.

---

### Step 7: Add integration tests for the webhook route
**Objective:** Lock down all rejection and success paths and the 202 latency budget.

**Files:**
- `apps/sync-engine/test/webhook.routes.test.ts` (create)

**Actions:**
1. Build a minimal Fastify instance, mount the webhook plugin with a stub `engine` exposing a spy `triggerPullNow`.
2. Cover cases via Fastify `inject`:
   - Valid signature + `push` event + matching branch → 202, spy called once with the delivery ID and `commitSha` from `after`.
   - Valid signature + `push` event + non-matching branch → 202, spy not called, response reason `branch`.
   - Valid signature + `pull_request` (or any non-push) event → 202, spy not called, response reason `event-type`.
   - Valid signature + `ping` event → 202, response reason `ping`, spy not called.
   - Bad signature → 401, spy not called.
   - Missing `x-hub-signature-256` header → 401, spy not called.
   - Missing raw body → 400, spy not called.
3. Assert that the response time for the success path is below 1000 ms by wrapping `inject` in a `performance.now()` measurement (use a generous budget of 250 ms in the assertion to keep CI stable).
4. Assert that the route did not mount on a Fastify instance built without enabling the webhook (small server-level test).
5. Assert that the request log lines (using a memory transport or Fastify's child logger spy) do not contain the secret string or the signature header value.

**Rules:**
- Must not call into the real `Engine`; the spy is sufficient.
- Must not require network access.
- Must use deterministic delivery IDs and commit SHAs.

**Output:**
- Comprehensive route coverage.

---

### Step 8: Documentation updates
**Objective:** Tell the operator how to wire the public proxy and the GitHub App webhook.

**Files:**
- `apps/sync-engine/README.md` (modify)

**Actions:**
1. Add a "Webhook setup" subsection under the GitHub App section introduced in Milestone 1.
2. Document Coder workspace public-proxy URL discovery and the resulting public webhook URL pattern.
3. Document the GitHub App webhook configuration: URL, secret (paired with `GITHUB_APP_WEBHOOK_SECRET`), content type `application/json`, subscribed event = Push only.
4. Document expected behavior: 202 on accepted deliveries (queued, ignored, or ping), 401 on signature failures, no pull on non-target branches.
5. Document the failure mode when the Coder proxy URL changes across rebuilds (operator must update the GitHub App).
6. Cross-reference Milestone 3's polling fallback note (link, do not duplicate).

**Rules:**
- Must not include the actual webhook secret value or any token in examples.
- Must use a placeholder like `<your-secret>`.

**Output:**
- README ready for operator handoff.

---

### Step 9: Run quality gates and update test snapshots
**Objective:** Verify the milestone is green before handing back.

**Files:**
- N/A (CI commands)

**Actions:**
1. Run `pnpm --filter sync-engine typecheck`.
2. Run `pnpm lint`.
3. Run `pnpm --filter sync-engine test`.
4. Fix any lint issues introduced by new files (line lengths, import ordering).

**Rules:**
- Must not silence lint rules with comments unless absolutely necessary; prefer fixing the cause.

**Output:**
- All gates green.

## 7. Validation & Verification

**`apps/sync-engine/test/webhook.signature.test.ts` (new):**
- Asserts `true` for a body+secret pair whose signature is computed inside the test.
- Asserts `false` for a tampered body, tampered signature, missing header, missing prefix, malformed hex, and empty header string.
- Asserts no throw on any malformed input.

**`apps/sync-engine/test/webhook.routes.test.ts` (new):**
- Signature good → 202 + spy invoked once.
- Signature bad → 401 + spy not invoked.
- Signature missing → 401 + spy not invoked.
- Event-type filter: `push` accepted, `pull_request` returns 202 with reason `event-type`, `ping` returns 202 with reason `ping`. Spy not invoked for any of these.
- Branch filter: `refs/heads/<targetBranch>` accepted, all other refs return 202 with reason `branch`. Spy not invoked for non-target branches.
- Coalescing under burst: 5 sequential `inject` calls within the same test tick all return 202; the spy is invoked 5 times (route-side coalescing happens inside `triggerPullNow`, not at the HTTP layer).
- 202 latency budget: success path completes in under 250 ms wall-clock per request in `inject`.
- No-mount: when the plugin is not registered (simulating `githubApp.enabled === false`), `POST /webhooks/github` returns 404.
- Log redaction: captured log lines contain neither the webhook secret nor the raw signature header value.

**`apps/sync-engine/test/trigger-pull-now.test.ts` (new):**
- Single call → exactly one pull.
- Two rapid calls → exactly two pulls (queued one runs after first completes).
- Five rapid calls during one in-flight pull → exactly two pulls total (in-flight + at-most-one-queued).
- `triggerPullNow` returns synchronously (the returned value is not thenable).
- Exception in `_pullTask` does not bubble out.

**Manual verification:**
- With Milestone 1's auth in place, configure a GitHub App and a sandbox repo, set the webhook URL to the Coder public proxy, push a commit from another worktree, observe a `change` SSE in `kanban-ui` within 5 s using `agent-browser`.
- Send a `ping` from the GitHub App settings page and confirm a 202 response with reason `ping`.

**Regression:**
- Re-run `pnpm test` workspace-wide.
- Re-run `pnpm verify:ui` to confirm no behavior regression in the UI/SSE contract.

## 8. Rollback Strategy

- The milestone lands as a single feature-branch PR. Reverting the merge commit removes the webhook route, the helper, and `triggerPullNow()`. Polling continues to function on its own (it is unchanged in this milestone).
- No on-disk schema, configuration migration, or persisted state is introduced; rollback requires no data fixup.
- If the webhook path proves unreliable in production, setting `githubApp.enabled = false` (or removing the env vars) disables the webhook route at startup without code changes; polling continues at its current cadence (Milestone 3 raises that cadence separately).
- The encapsulated raw-body content-type parser is registered only inside the webhook plugin's scope, so disabling the route fully removes the parser from the active Fastify instance.

## 9. Open Questions

- **Coalescing storage location:** `triggerPullNow` could live inside the existing polling `RetryScheduler`'s `manualTick`, which already serializes via the engine's mutex, instead of new in-flight/queued fields on `Engine`. Current plan keeps them separate to avoid resetting the scheduler's backoff on every webhook delivery; revisit if the two paths diverge in failure handling.
- **Burst coalescing window:** "At most one queued" is the simplest rule; a small time-window debounce (e.g. 200 ms) might further reduce pulls under heavy bursts. Deferred until measured.
- **Per-event ID dedup:** GitHub may retry deliveries; the plan does not currently dedupe by `X-GitHub-Delivery`. Pulls are idempotent so duplicates are safe, but logging may show double "queued" lines. Acceptable for now.
- **Body size cap:** GitHub push payloads can be large for branches with many commits. Fastify's default body limit (1 MB) may need to be raised for the webhook route. Confirm during integration testing; if needed, set a higher `bodyLimit` on the route options scoped to the plugin only.
- **Logger transport for redaction tests:** Whether to add a small in-memory logger transport just for the test, or to spy on `fastify.log.info`. Current plan: spy. Revisit if too brittle.

## 10. References

- Validating webhook deliveries: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- `push` event payload: https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
- Fastify v5 ContentTypeParser: https://fastify.dev/docs/latest/Reference/ContentTypeParser/
- Fastify v5 inject (testing): https://fastify.dev/docs/latest/Guides/Testing/
- Node.js `crypto.timingSafeEqual`: https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
- Main plan: [ai-docs/github-app-webhook-main.md](github-app-webhook-main.md)
- Milestone 1 plan: ai-docs/github-app-webhook-milestone-1-app-auth.md (sibling milestone, prerequisite)
