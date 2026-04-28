# Milestone Plan: GitHub App auth & installation-token cache

## 0. Metadata
- **Milestone:** 1 of 3
- **Complexity:** 3
- **Uncertainty:** 2
- **Work:** 3
- **Scope:** Replace the long-lived `GITHUB_TOKEN` PAT used by `git fetch` / `git push` with a short-lived GitHub App installation access token, minted on demand and cached. Make `getAuthenticatedUrl()` async and propagate that change through every caller. Surface mint failures as `NetworkFailureReason: 'auth'`.
- **Non-goals:**
  - Webhook receiver, signature verification, push-trigger plumbing (Milestone 2).
  - Polling cadence change (Milestone 3).
  - Auto-discovery of `installationId` from the repo.
  - GitHub App registration UX or onboarding tooling.
  - Multi-installation / multi-repo orchestration.
  - Any change to commit / conflict / SSE / watcher behaviour.
- **Estimated Files:** ~14 created or modified.
- **Dependencies:** None (first milestone). Requires that an operator-registered GitHub App exists with `Contents: read/write` permission on the target repo and an installation on the target repo's owner.

---

## 1. Objective

Introduce a `GitCredentialProvider` backed by a GitHub App installation-token cache, wire it through `remote-config.ts`, and remove the legacy `GITHUB_TOKEN` PAT from runtime config, env templates, docs, and tests — leaving the existing pull/push behaviour functionally unchanged from the caller's perspective.

---

## 2. Constraints & Assumptions

- App credentials are read **only** from environment variables: `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and one of `GITHUB_APP_PRIVATE_KEY` (inline PEM) or `GITHUB_APP_PRIVATE_KEY_PATH` (file path). `GITHUB_APP_WEBHOOK_SECRET` is parsed and validated by the schema in this milestone but unused by code paths until Milestone 2.
- The private key is loaded into memory at startup; reload-on-change is not supported in this milestone.
- The token cache refreshes when `expiresAt − now < 5 minutes`. JWTs are signed with a 9-minute TTL (1-minute clock skew below GitHub's 10-minute maximum).
- All net-new and modified source files stay ≤ 400 lines.
- No App credential, JWT, installation token, or PEM byte is ever logged at any level. Only redacted prefixes (e.g. `appId=12345`) and `expiresAt` are loggable.
- `simpleGit` continues to consume an authenticated HTTPS URL; the credential mechanism does not change git transport.
- `remote.enabled` and the App config form a single composite gate: when remote sync is enabled but App config is missing or malformed, startup fails fast with a friendly error message that names the missing variable.
- Local-only operation (no remote, no App vars) remains supported and is the default.
- Library choice: **`@octokit/auth-app`** is adopted as the default for JWT signing and installation-token retrieval (rationale recorded in §9).
- Test infrastructure: existing Vitest setup, fault injectors, and `engine-harness` fixture continue to work; the harness is updated to inject a fake `GitCredentialProvider` instead of a `githubToken` string.
- Out of scope: token persistence across sync-engine restarts; tokens are always re-minted on boot.

---

## 3. Deliverables (Definition of Done)

- [ ] `apps/sync-engine/src/github-app/` directory exists and exports `GitCredentialProvider`, a factory, and the cache implementation.
- [ ] `EngineConfigSchema` includes a `githubApp` section with `appId`, `installationId`, `privateKey` (string | null), `privateKeyPath` (string | null), `webhookSecret` (string | null), and an XOR rule rejecting "both / neither" for the private-key fields.
- [ ] `EngineConfig` type drops `githubToken` and gains a `githubApp` block.
- [ ] `RemoteConfig.getAuthenticatedUrl()` returns `Promise<string>`.
- [ ] `puller.ts`, `pusher.ts`, and `remote-worker.ts` await the new async accessor; classification of mint failures yields `NetworkFailureReason: 'auth'`.
- [ ] `engine.ts` constructs the `GitCredentialProvider` once at startup and passes it to `createRemoteConfig`.
- [ ] `apps/sync-engine/.env.example` documents the new variables and removes `GITHUB_TOKEN`.
- [ ] `apps/sync-engine/README.md` documents App registration, permissions, and required env vars (webhook URL section deferred to Milestone 2).
- [ ] `.github/copilot-instructions.md` Git auth row and sync-engine env-vars row updated.
- [ ] `engine-harness` fixture supplies a stub `GitCredentialProvider`; existing tests continue to pass.
- [ ] New unit-test files exist for: token cache (hit, near-expiry refresh, mint failure → `'auth'`), config validation (missing required vars, XOR violation, valid input), and remote-config token injection via async provider.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass at workspace root.
- [ ] No `GITHUB_TOKEN` reference remains in `apps/sync-engine/src`, `apps/sync-engine/test`, `apps/sync-engine/.env.example`, `apps/sync-engine/README.md`, or `.github/copilot-instructions.md`. (`apps/sync-engine/.env` is gitignored and operator-managed; not enforced.)

**Verifiable Success Criteria:**
- [ ] `rg "GITHUB_TOKEN" apps/sync-engine/src apps/sync-engine/test apps/sync-engine/.env.example apps/sync-engine/README.md .github/copilot-instructions.md` returns no matches.
- [ ] `rg "githubToken" apps/sync-engine/src apps/sync-engine/test packages` returns no matches.
- [ ] `rg "getAuthenticatedUrl\(\)" apps/sync-engine/src` shows every call site preceded by `await`.
- [ ] New test file `apps/sync-engine/test/github-app.token.test.ts` exists and passes.
- [ ] New test file `apps/sync-engine/test/github-app.config.test.ts` exists and passes.
- [ ] `apps/sync-engine/test/token-redaction.test.ts` updated to exercise the App-token URL and still passes.

---

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `apps/sync-engine/src/github-app/index.ts` | Create | Public barrel: re-exports `GitCredentialProvider` type, `createGitCredentialProvider` factory, and `MintFailureError`. |
| `apps/sync-engine/src/github-app/types.ts` | Create | `GitCredentialProvider` interface, `InstallationToken` shape, `GithubAppCredentials` shape, `MintFailureError` class. |
| `apps/sync-engine/src/github-app/private-key-loader.ts` | Create | Resolves the PEM source: prefers inline, falls back to file path; throws a friendly error when neither is set or the file is missing. |
| `apps/sync-engine/src/github-app/installation-token-cache.ts` | Create | Cache implementation: holds the current token + `expiresAt`, refreshes when within 5 min of expiry, single-flight refresh promise to avoid duplicate mint calls. |
| `apps/sync-engine/src/github-app/octokit-minter.ts` | Create | Adapter around `@octokit/auth-app` returning `{ token, expiresAt }`; isolates the third-party dependency for testability. |
| `apps/sync-engine/src/github-app/clock.ts` | Create | Time-source seam (`now()` returning `Date`) used by the cache; tests can swap it. |
| `apps/sync-engine/src/config.schema.ts` | Modify | Add `GithubAppSchema` with XOR private-key validation and an optional `webhookSecret`. Make `githubApp` optional at the top level. |
| `apps/sync-engine/src/config.ts` | Modify | Map `GITHUB_APP_*` env vars (note: no `SYNC_ENGINE_` prefix). Drop the `GITHUB_TOKEN` read. Enforce: when `remote.enabled = true`, `githubApp` must be present and valid. |
| `apps/sync-engine/src/types.ts` | Modify | Remove `githubToken` from `EngineConfig`. Add `githubApp` block. No change to `NetworkFailureReason`. |
| `apps/sync-engine/src/remote-config.ts` | Modify | Constructor accepts a `GitCredentialProvider` instead of a token string. `getAuthenticatedUrl()` becomes async, calls the provider, injects the token into the URL, and translates provider failures to a thrown `MintFailureError`. `redactedUrl` derives the redaction marker from a static placeholder rather than the live token. |
| `apps/sync-engine/src/puller.ts` | Modify | `await remoteConfig.getAuthenticatedUrl()`. Catch `MintFailureError` and return `{ kind: 'network-failure', reason: 'auth' }`. |
| `apps/sync-engine/src/pusher.ts` | Modify | Same change as `puller.ts`. |
| `apps/sync-engine/src/remote-worker.ts` | Modify | No call-site change to `getAuthenticatedUrl` itself, but verify no internal helpers cache the URL synchronously. Confirm `RemoteContext` shape unchanged. |
| `apps/sync-engine/src/engine.ts` | Modify | Build the `GitCredentialProvider` once during `start()` (only when `remote.enabled`). Pass it to `createRemoteConfig`. Surface a friendly error message if construction fails. |
| `apps/sync-engine/.env.example` | Modify | Remove `GITHUB_TOKEN` block. Add a documented block for `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_APP_WEBHOOK_SECRET`, with comments explaining the inline-vs-path XOR. |
| `apps/sync-engine/README.md` | Modify | Replace the "Remote auth: GITHUB_TOKEN" section with a "Remote auth: GitHub App" section: registration steps, required permissions (`Contents: read/write`), required env vars, and a callout that webhook setup is documented in Milestone 2. |
| `apps/sync-engine/package.json` | Modify | Add `@octokit/auth-app` as a runtime dependency. |
| `.github/copilot-instructions.md` | Modify | Update the "Git auth" row in the tech-stack table from PAT to GitHub App; update the sync-engine row in the env-vars table to list the new vars. |
| `apps/sync-engine/test/fixtures/engine-harness.ts` | Modify | Replace `githubToken` injection with a stub `GitCredentialProvider` returning a fixed token + far-future `expiresAt`. |
| `apps/sync-engine/test/token-redaction.test.ts` | Modify | Use the stub provider; assert the App-style token is redacted in URL output and never appears in logged status. |
| `apps/sync-engine/test/config.test.ts` | Modify | Drop `GITHUB_TOKEN` cases. Add cases for `githubApp` env-var mapping. |
| `apps/sync-engine/test/github-app.token.test.ts` | Create | Unit tests for the installation-token cache and minter adapter. |
| `apps/sync-engine/test/github-app.config.test.ts` | Create | Unit tests for the config schema's `githubApp` section and XOR rule. |
| `apps/sync-engine/test/github-app.private-key.test.ts` | Create | Unit tests for the PEM loader (inline, path, missing, unreadable). |

---

## 5. Use Case Implementation

**Use Cases Covered (referencing main plan §5):**
- **UC-3** (full): "Operator boots sync-engine without GitHub App." This milestone owns the friendly-error path when remote is enabled but App config is missing or malformed, and the silent local-only path when remote is disabled.
- **UC-4** (full): "Token expiry during long-running session." This milestone implements the cache-refresh trigger, JWT mint, installation-token request, and `'auth'` classification on failure.
- **UC-1** (credential portion only): supplies the fresh installation token used by the immediate-pull path; webhook trigger is delivered by Milestone 2.
- **UC-2** (credential portion only): supplies the fresh installation token used by the polling path; cadence change is delivered by Milestone 3.

**Layer Responsibility:**
- The `github-app` module owns the credential lifecycle: load PEM → mint JWT → exchange for installation token → cache → refresh.
- `remote-config.ts` owns URL composition and redaction; it never reads PEM or env directly.
- `puller.ts` / `pusher.ts` own `'auth'` classification when the credential provider throws.
- `engine.ts` owns startup-time wiring and friendly-error reporting.

### Contract: `GitCredentialProvider` (formalised)

| Field | Shape | Notes |
|-------|-------|-------|
| `getInstallationToken()` | `() => Promise<InstallationToken>` | Returns a non-expired token. Internally caches and refreshes. Never returns a token within 5 minutes of `expiresAt`. |
| `dispose()` | `() => void` | Optional. Clears any in-flight refresh promise. Used by tests and graceful shutdown. |

| `InstallationToken` field | Shape | Notes |
|----|----|----|
| `token` | `string` | Opaque GitHub installation access token. Treated as a secret; never logged. |
| `expiresAt` | `Date` | UTC instant returned by GitHub. |

**Error contract:** All failure modes throw `MintFailureError extends Error` with a `reason: 'config' \| 'network' \| 'http-4xx' \| 'http-5xx' \| 'unknown'`. Callers in `puller.ts` / `pusher.ts` translate `MintFailureError` to `NetworkFailureReason: 'auth'`. Startup-time `'config'` failures bubble up to `engine.start()` for friendly reporting.

**Interface notes (clarifying main plan ambiguity):**
- The provider is constructed once per sync-engine process; `RemoteConfig` holds a reference, not a token snapshot.
- `redactedUrl` is computed using a fixed redaction sentinel (e.g. `***INSTALLATION_TOKEN***`) instead of the live token, since the live token is no longer known synchronously.

---

## 6. Step-by-Step Execution Plan

### Step 1: Add the GitHub App config schema
**Objective:** Validate App credentials at startup and gate remote sync on their presence.

**Files:**
- `apps/sync-engine/src/config.schema.ts` (modify)

**Actions:**
1. Add a `GithubAppSchema` Zod object with fields: `appId` (string, non-empty), `installationId` (string, non-empty), `privateKey` (string nullable), `privateKeyPath` (string nullable), `webhookSecret` (string nullable).
2. Add a refinement to `GithubAppSchema` rejecting the case where both `privateKey` and `privateKeyPath` are set, and the case where neither is set, with a descriptive message naming the two env vars.
3. Add an optional `githubApp: GithubAppSchema.optional()` field to `EngineConfigSchema`.
4. Add a top-level cross-field refinement: when `remote.enabled === true`, `githubApp` must be defined; otherwise reject with a friendly message naming `GITHUB_APP_ID` etc.

**Rules:**
- Must keep `githubApp` optional so the local-only baseline (UC-3 happy path with `remote.enabled = false`) parses successfully without App vars.
- Must not log any field value in error messages — error messages reference variable names only.

**Output:**
- `EngineConfigSchema` accepts the new shape and rejects the four invalid permutations (no key, both keys, no app vars when remote enabled, malformed numeric IDs).

---

### Step 2: Map App env vars in the config loader
**Objective:** Source App credentials from process env without the `SYNC_ENGINE_` prefix.

**Files:**
- `apps/sync-engine/src/config.ts` (modify)

**Actions:**
1. Add a helper that collects `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_APP_WEBHOOK_SECRET` from `process.env` into a partial `githubApp` object. Omit unset fields.
2. Merge the partial into `merged.githubApp` only when at least one field is present.
3. Remove the existing `GITHUB_TOKEN` read and its assignment to `resolvedConfig.githubToken`.
4. Update the docstring on `loadConfig` to describe the new env-var contract.

**Rules:**
- Must read env vars directly (no `SYNC_ENGINE_` prefix), matching the convention in the main plan §2.
- Must not coerce `appId` / `installationId` to numbers; they remain strings to avoid precision loss.

**Output:**
- `loadConfig` returns an `EngineConfig` whose `githubApp` field is populated from env when set, or absent when fully unset.

---

### Step 3: Update the runtime config type
**Objective:** Reflect the schema change in TypeScript types.

**Files:**
- `apps/sync-engine/src/types.ts` (modify)

**Actions:**
1. Remove the `githubToken?: string` field from `EngineConfig`.
2. Add a `githubApp?: GithubAppRuntimeConfig` field to `EngineConfig`.
3. Define `GithubAppRuntimeConfig` mirroring the schema (string fields; nullable `privateKey` / `privateKeyPath` / `webhookSecret`).

**Rules:**
- Must not introduce `any`.
- Must keep `EngineConfig` readonly-friendly (consistent with `Object.freeze` usage in `loadConfig`).

**Output:**
- Type checker enforces the new shape across the codebase.

---

### Step 4: Implement the private-key loader
**Objective:** Resolve a PEM string from inline value or file path with a clear failure mode.

**Files:**
- `apps/sync-engine/src/github-app/private-key-loader.ts` (create)

**Actions:**
1. Export a function that accepts `{ privateKey, privateKeyPath }` and returns the PEM string.
2. When `privateKey` is set, return it verbatim (after a basic non-empty check).
3. When `privateKeyPath` is set, read the file synchronously at startup and return its contents.
4. On file-not-found or unreadable file, throw a `MintFailureError` with `reason: 'config'` whose message names the path but not its contents.

**Rules:**
- Must not log the PEM contents.
- Must not normalise newlines beyond what `readFileSync` returns.

**Output:**
- A pure function the cache can call once during construction.

---

### Step 5: Implement the Octokit minter adapter
**Objective:** Encapsulate the third-party dependency behind a small interface.

**Files:**
- `apps/sync-engine/src/github-app/octokit-minter.ts` (create)
- `apps/sync-engine/src/github-app/types.ts` (create)

**Actions:**
1. In `types.ts`, define `GitCredentialProvider`, `InstallationToken`, `GithubAppCredentials`, and the `MintFailureError` class with the `reason` field.
2. In `octokit-minter.ts`, export a function `mintInstallationToken({ appId, installationId, privateKey, clock })` that uses `@octokit/auth-app` to obtain `{ token, expiresAt }`.
3. Wrap all thrown errors into `MintFailureError`, mapping HTTP status / network errors to the appropriate `reason` value.

**Rules:**
- Must not log the token, JWT, or PEM.
- Must accept `clock` injection for testability rather than calling `Date.now()` directly.

**Output:**
- A single async function returning `InstallationToken` or throwing `MintFailureError`.

---

### Step 6: Implement the installation-token cache
**Objective:** Add caching, expiry-aware refresh, and single-flight semantics.

**Files:**
- `apps/sync-engine/src/github-app/installation-token-cache.ts` (create)
- `apps/sync-engine/src/github-app/clock.ts` (create)

**Actions:**
1. In `clock.ts`, export a default clock and a `Clock` interface with a `now()` method.
2. In `installation-token-cache.ts`, export `createInstallationTokenCache({ minter, clock })` returning a `GitCredentialProvider`.
3. Implement `getInstallationToken()`: return the cached token when `expiresAt − now > 5 min`; otherwise call the minter and cache its result.
4. Track an in-flight refresh `Promise` to coalesce concurrent callers; clear the field when settled.
5. Implement `dispose()` to null the cache and the in-flight promise.

**Rules:**
- Must enforce the 5-minute refresh threshold exactly.
- Must not retry on minter failure within `getInstallationToken`; surface the error to the caller for `'auth'` classification.
- Must serialise concurrent refresh attempts so only one mint is in flight at a time.

**Output:**
- A `GitCredentialProvider` instance ready to be passed to `RemoteConfig`.

---

### Step 7: Add the public barrel and factory
**Objective:** Single import surface for the rest of the sync-engine.

**Files:**
- `apps/sync-engine/src/github-app/index.ts` (create)

**Actions:**
1. Re-export `GitCredentialProvider`, `InstallationToken`, `MintFailureError`, `GithubAppCredentials` from `./types.js`.
2. Export a `createGitCredentialProvider({ githubApp })` factory that: loads the PEM via the loader, builds the minter, builds the cache, and returns the provider.
3. Translate any synchronous loader errors into a thrown `MintFailureError` with `reason: 'config'`.

**Rules:**
- Must perform PEM loading eagerly so misconfiguration fails at engine startup, not on first pull.
- Must not call the network at construction time (no eager mint).

**Output:**
- A one-line construction call usable from `engine.ts`.

---

### Step 8: Update `remote-config.ts` for async credentials
**Objective:** Replace the static-token model with a credential-provider model.

**Files:**
- `apps/sync-engine/src/remote-config.ts` (modify)

**Actions:**
1. Change `createRemoteConfig`'s signature to accept a `GitCredentialProvider | null` instead of a `token: string | null` argument.
2. Change the `getAuthenticatedUrl` field on `RemoteConfig` from `() => string` to `() => Promise<string>`.
3. In the new `getAuthenticatedUrl`, when the provider is null or the origin is non-HTTPS / non-GitHub, return the origin URL as-is.
4. Otherwise, await `provider.getInstallationToken()` and inject the token using the existing `injectToken` helper. Re-throw `MintFailureError` to the caller.
5. Replace the live-token redaction in `redactedUrl` with a static sentinel (`***INSTALLATION_TOKEN***`) so the property remains synchronous.
6. Update the JSDoc to describe the new credential model and async signature.

**Rules:**
- Must not cache the resolved URL inside `RemoteConfig`; each call gets a fresh token.
- Must not log the resolved URL.
- Must keep the public field names `branch`, `originUrl`, `redactedUrl`, `owner`, `repo` unchanged for status reporting.

**Output:**
- `RemoteConfig.getAuthenticatedUrl(): Promise<string>`; all other fields unchanged.

---

### Step 9: Update `puller.ts` call site
**Objective:** Await the new accessor and classify mint failures.

**Files:**
- `apps/sync-engine/src/puller.ts` (modify)

**Actions:**
1. Change the call at the top of `pullOnce` to `await remoteConfig.getAuthenticatedUrl()`.
2. Wrap the awaited call in a `try`/`catch` that, on `MintFailureError`, returns `{ kind: 'network-failure', reason: 'auth' }`.
3. Keep all existing status-check, fetch, and merge logic unchanged.

**Rules:**
- Must catch `MintFailureError` specifically and let other exceptions propagate to the existing classifier.

**Output:**
- `pullOnce` produces `{ kind: 'network-failure', reason: 'auth' }` when the provider fails.

---

### Step 10: Update `pusher.ts` call site
**Objective:** Mirror the puller change in the push path.

**Files:**
- `apps/sync-engine/src/pusher.ts` (modify)

**Actions:**
1. Change the call at the top of `pushOnce` to `await remoteConfig.getAuthenticatedUrl()`.
2. Wrap the awaited call in the same `try`/`catch` returning `{ kind: 'network-failure', reason: 'auth' }` on `MintFailureError`.
3. Keep `up-to-date` short-circuit and rejection classification unchanged.

**Rules:**
- Must keep the order: status check → token fetch → push, so a stale offline state does not pre-empt the auth check.

**Output:**
- `pushOnce` produces `{ kind: 'network-failure', reason: 'auth' }` when the provider fails.

---

### Step 11: Verify `remote-worker.ts`
**Objective:** Confirm no internal helper calls `getAuthenticatedUrl` synchronously.

**Files:**
- `apps/sync-engine/src/remote-worker.ts` (modify if needed)

**Actions:**
1. Re-read every reference to `remoteConfig` in this file.
2. Confirm none of them call `getAuthenticatedUrl()` (only `puller`/`pusher` do today).
3. If any unexpected synchronous call exists, convert to `await` within the surrounding async function.

**Rules:**
- Must not introduce new responsibilities into `remote-worker.ts` in this milestone.

**Output:**
- No behaviour change; explicit confirmation that the worker contract holds.

---

### Step 12: Wire the provider into `engine.ts`
**Objective:** Construct the credential provider once at startup.

**Files:**
- `apps/sync-engine/src/engine.ts` (modify)

**Actions:**
1. Add a private field for the `GitCredentialProvider` (nullable).
2. In the `start()` path that builds `remoteConfig`, when remote is enabled and `config.githubApp` is present, call `createGitCredentialProvider({ githubApp: config.githubApp })` and assign the result to the field.
3. Pass the provider into `createRemoteConfig` instead of a token.
4. When `createGitCredentialProvider` throws `MintFailureError` with `reason: 'config'`, re-throw with a prefixed message identifying the missing variable, so `engine.start()` exits with a friendly startup error.
5. On `stop()`, call `provider.dispose?.()`.

**Rules:**
- Must not construct the provider when `remote.enabled === false`.
- Must not call the network during `start()`.

**Output:**
- Engine wires the provider through `createRemoteConfig`; failures during construction surface as fatal, descriptive startup errors.

---

### Step 13: Update env template and README
**Objective:** Replace PAT documentation with App documentation.

**Files:**
- `apps/sync-engine/.env.example` (modify)
- `apps/sync-engine/README.md` (modify)

**Actions:**
1. In `.env.example`, remove the `GITHUB_TOKEN` block. Add a "GitHub App credentials" block listing `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_APP_WEBHOOK_SECRET` with concise comments and an explicit note that exactly one of `PRIVATE_KEY` or `PRIVATE_KEY_PATH` must be set.
2. In `README.md`, replace the "Remote auth: GITHUB_TOKEN" section with "Remote auth: GitHub App". Document App registration steps, required permission (`Contents: read/write`), required env vars, and a marker that webhook setup arrives in Milestone 2. Update the env-var table accordingly.

**Rules:**
- Must not include any real token, ID, or PEM in either file.

**Output:**
- Operator-facing docs reflect the App-based credential model.

---

### Step 14: Update workspace agent docs
**Objective:** Align the project guide with the new credential model.

**Files:**
- `.github/copilot-instructions.md` (modify)

**Actions:**
1. Update the "Git auth" row in the tech-stack table to read "GitHub App installation tokens (`@octokit/auth-app`)".
2. Update the sync-engine row of the env-vars table to list `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`/`GITHUB_APP_PRIVATE_KEY_PATH`, and `GITHUB_APP_WEBHOOK_SECRET` (note unused until M2). Remove `GITHUB_TOKEN`.

**Rules:**
- Must keep the file under the 600-word AI-file limit.

**Output:**
- AI-agent guidance matches runtime behaviour.

---

### Step 15: Add the dependency
**Objective:** Make `@octokit/auth-app` available.

**Files:**
- `apps/sync-engine/package.json` (modify)
- `pnpm-lock.yaml` (auto-modified by `pnpm install`)

**Actions:**
1. Add `@octokit/auth-app` to `dependencies` of `apps/sync-engine`.
2. Run `pnpm install` from the workspace root.

**Rules:**
- Must not pull in `@octokit/rest` or `@octokit/webhooks` in this milestone.

**Output:**
- Lockfile updated; new dep resolvable.

---

### Step 16: Update the engine test harness
**Objective:** Allow existing tests to run without real App credentials.

**Files:**
- `apps/sync-engine/test/fixtures/engine-harness.ts` (modify)

**Actions:**
1. Replace the `githubToken` field in the harness's `EngineConfig` synthesis with omission.
2. Provide a stub `GitCredentialProvider` that returns a fixed token string and an `expiresAt` one hour ahead.
3. Inject the stub via a new option on the harness API (e.g. `credentialProvider`) and route it into `createRemoteConfig` (or supply an injection seam in `engine.ts` for tests).

**Rules:**
- Must not require updating every existing test signature; default to the stub when not specified.
- Must not introduce real network calls into any existing test.

**Output:**
- Existing test suites compile and pass without the legacy token field.

---

### Step 17: Update `token-redaction.test.ts` and `config.test.ts`
**Objective:** Realign existing assertions with the new credential model.

**Files:**
- `apps/sync-engine/test/token-redaction.test.ts` (modify)
- `apps/sync-engine/test/config.test.ts` (modify)

**Actions:**
1. In `token-redaction.test.ts`, replace PAT-style fixtures with the harness's stub provider; assert the resolved URL never appears in `status` output and that `redactedUrl` shows the new sentinel.
2. In `config.test.ts`, remove tests that assert `GITHUB_TOKEN` is read into `EngineConfig`. Add tests that assert `GITHUB_APP_*` vars populate `config.githubApp`.

**Rules:**
- Must keep all other existing assertions intact.

**Output:**
- Existing redaction guarantees still proven, now over the App-token URL.

---

### Step 18: Add new unit tests for the App module
**Objective:** Cover cache, config, and PEM loader.

**Files:**
- `apps/sync-engine/test/github-app.token.test.ts` (create)
- `apps/sync-engine/test/github-app.config.test.ts` (create)
- `apps/sync-engine/test/github-app.private-key.test.ts` (create)

**Actions:**
1. In `github-app.token.test.ts`, exercise the cache with a fake clock and a fake minter: cache hit (no mint call), refresh when within 5 min of expiry, single-flight coalescing under concurrent callers, mint failure surfaces as `MintFailureError` translated to `'auth'` by a thin wrapper test.
2. In `github-app.config.test.ts`, validate the schema for: valid input, missing `appId`, missing `installationId`, both keys set, neither key set, `remote.enabled = true` with no `githubApp`.
3. In `github-app.private-key.test.ts`, validate: inline value returned verbatim, file-path read, file-not-found throws `'config'`, both/neither rejected upstream by the schema (sanity reference).

**Rules:**
- Must not call the network. The minter is faked.
- Must not write real PEM material; tests use placeholder strings.

**Output:**
- All three test files pass under `pnpm --filter sync-engine test`.

---

### Step 19: Final sweep for `GITHUB_TOKEN`
**Objective:** Ensure no legacy reference remains.

**Files:**
- All workspace files except `apps/sync-engine/.env` (gitignored, operator-managed) and `apps/sync-engine/dist/**` (build output, regenerated).

**Actions:**
1. Run `rg "GITHUB_TOKEN"` and `rg "githubToken"` from the workspace root.
2. Remove any remaining references in `apps/sync-engine/src`, `apps/sync-engine/test`, `apps/sync-engine/.env.example`, `apps/sync-engine/README.md`, and `.github/copilot-instructions.md`.
3. Leave `apps/sync-engine/dist/**` untouched (rebuild produces fresh output).

**Rules:**
- Must not delete `apps/sync-engine/.env`; operator-managed file.

**Output:**
- Workspace search returns zero non-build matches.

---

### Step 20: Quality gates
**Objective:** Confirm milestone completeness.

**Files:** N/A (commands only).

**Actions:**
1. Run `pnpm typecheck`.
2. Run `pnpm lint`.
3. Run `pnpm --filter sync-engine test`.
4. Run `pnpm test` at workspace root.

**Rules:**
- Must not skip any failing test.

**Output:**
- All four commands exit zero.

---

## 7. Data Model / Schema

**Schema delta — `EngineConfigSchema`:**

| Field | Type | Default | Constraint |
|-------|------|---------|------------|
| `githubApp` | object (optional) | absent | Required when `remote.enabled === true`. |
| `githubApp.appId` | string (non-empty) | — | — |
| `githubApp.installationId` | string (non-empty) | — | — |
| `githubApp.privateKey` | string \| null | null | XOR with `privateKeyPath`; exactly one must be set. |
| `githubApp.privateKeyPath` | string \| null | null | XOR with `privateKey`. |
| `githubApp.webhookSecret` | string \| null | null | Unused in M1; reserved for M2. |

**Type delta — `EngineConfig`:**
- Removed: `githubToken?: string`.
- Added: `githubApp?: GithubAppRuntimeConfig` (mirrors schema).

**Type delta — `RemoteConfig`:**
- Changed: `getAuthenticatedUrl: () => string` → `getAuthenticatedUrl: () => Promise<string>`.

**No on-disk schema changes.** No database. No migration scripts.

---

## 8. Validation & Verification

**New tests:**

| File | Asserts |
|------|---------|
| `apps/sync-engine/test/github-app.token.test.ts` | Cache hit returns same token without re-minting; cache refreshes when `expiresAt − now < 5 min`; single-flight coalesces concurrent callers; minter exception surfaces as `MintFailureError`; `dispose()` clears state. |
| `apps/sync-engine/test/github-app.config.test.ts` | Valid `githubApp` parses; missing `appId` rejected; missing `installationId` rejected; both `privateKey` + `privateKeyPath` rejected; neither rejected; `remote.enabled=true` without `githubApp` rejected; local-only (`remote.enabled=false`, no `githubApp`) accepted. |
| `apps/sync-engine/test/github-app.private-key.test.ts` | Inline PEM returned verbatim; file PEM read; missing file throws `MintFailureError{reason:'config'}`; unreadable file throws `MintFailureError{reason:'config'}`. |

**Modified tests:**

| File | Asserts (after change) |
|------|------------------------|
| `apps/sync-engine/test/token-redaction.test.ts` | `redactedUrl` returns the sentinel; resolved authenticated URL is awaitable; the live token never appears in status payloads or logs. |
| `apps/sync-engine/test/config.test.ts` | `GITHUB_APP_*` env vars populate `config.githubApp`; `config.githubToken` no longer exists; legacy PAT cases removed. |
| `apps/sync-engine/test/fixtures/engine-harness.ts` (fixture, not a test) | Provides a stub `GitCredentialProvider` so existing tests function. |

**Regression tests (untouched, must still pass):**
- `apps/sync-engine/test/pull-fast-forward.test.ts`
- `apps/sync-engine/test/push-roundtrip.test.ts`
- `apps/sync-engine/test/offline-retry.test.ts`
- `apps/sync-engine/test/conflict-*.test.ts`
- `apps/sync-engine/test/sse.test.ts`
- `apps/sync-engine/test/event-ordering.test.ts`
- `apps/sync-engine/test/resilience.test.ts`
- `apps/sync-engine/test/watcher-commit.test.ts`
- `apps/sync-engine/test/batching.test.ts`

**Manual verification checklist:**
- Boot sync-engine with `remote.enabled=false` and no App vars → starts cleanly, no warnings about credentials.
- Boot sync-engine with `remote.enabled=true` and missing `GITHUB_APP_ID` → fails with a message naming the missing variable.
- Boot sync-engine with `remote.enabled=true` and a valid App config against a sandbox repo → `git fetch` and `git push` succeed; `redactedUrl` in `/status` shows the sentinel.
- Force a token refresh by setting the cache's stored `expiresAt` to 4 minutes in the future via test seam → next `getAuthenticatedUrl()` call mints a fresh token.

**Quality gates (CI):**
- `pnpm typecheck` exits 0.
- `pnpm lint` exits 0.
- `pnpm test` exits 0.

---

## 9. Rollback Strategy

- All Milestone 1 changes land on a single feature branch and PR; revert is a single `git revert` of the merge commit.
- No on-disk schema, no migration; rollback requires no data fixup.
- After revert, the previous `GITHUB_TOKEN` PAT path is restored verbatim, including `.env.example` and README guidance.
- Operators must reinstate `GITHUB_TOKEN` in their `apps/sync-engine/.env` after revert; this is documented in the PR description.
- The `@octokit/auth-app` dependency is removed by the same revert (it is added in this milestone only).
- Tests written in Milestone 1 are removed by revert; legacy `token-redaction.test.ts` content is restored by revert.
- No follow-up coordination is required because no external system holds state introduced by this milestone (installation tokens are minted on demand and not persisted).

---

## 10. Open Questions

- **Library choice — recommended default: `@octokit/auth-app`.** Rationale: it implements JWT signing, installation-token exchange, retry on transient HTTP failures, and clock-skew handling, all maintained by GitHub. The hand-rolled alternative (`node:crypto.createSign` + `fetch`) saves ~one dependency but adds ~150 lines of code, custom JWT/RFC handling, and a maintenance burden that conflicts with the ≤ 400-line file budget. The dependency footprint is small (`@octokit/auth-app` and its transitive `@octokit/request` are already lightweight). **This milestone proceeds with `@octokit/auth-app`** unless the open question is overridden by reviewer.
- **`webhookSecret` placement.** Schema introduced in M1 to avoid a second config schema migration; consumed in M2. Confirmed acceptable per main plan §6 Milestone 2.
- **Token refresh logging.** Whether to emit an INFO-level log line on each mint (without secrets) for operability. Default in M1: log `appId` prefix and `expiresAt` only at INFO; nothing at lower or higher verbosity. Open for review.
- **Friendly error reporting for missing config.** Whether the engine should print a multi-line "how to fix" block (referencing `apps/sync-engine/README.md`) or a single-line error. Default in M1: single-line error naming the variable; README is the canonical setup reference.
- **Test seam for the cache clock.** Whether to expose the `Clock` injection as a public option of `createGitCredentialProvider` or keep it internal to the cache constructor. Default in M1: keep internal, tests construct the cache directly via `createInstallationTokenCache`.

---

## 11. References

- Main plan: [ai-docs/github-app-webhook-main.md](github-app-webhook-main.md)
- GitHub: Authenticating as a GitHub App installation — https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- GitHub: Generating a JWT for a GitHub App — https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
- GitHub: REST API — Create an installation access token — https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app
- `@octokit/auth-app` — https://github.com/octokit/auth-app.js
- Project conventions: [.github/copilot-instructions.md](../.github/copilot-instructions.md)
- Existing remote-config implementation: [apps/sync-engine/src/remote-config.ts](../apps/sync-engine/src/remote-config.ts)
- Network failure taxonomy: [apps/sync-engine/src/types.ts](../apps/sync-engine/src/types.ts)
