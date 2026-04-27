# Milestone Plan: HTTP/SSE Provider Client + Runtime Provider Selection

## 0. Metadata
- **Milestone:** 5 of 10
- **Complexity:** 3
- **Work:** 2
- **Estimated Files:** ~18
- **Dependencies:** M3 (kanban-ui shell with localStorage provider), M4 (fs sidecar exposing HTTP CRUD + SSE)

## 1. Objective
Add a second `PersistenceProvider` implementation that talks to the M4 fs sidecar over HTTP + SSE, and let users switch providers at runtime from the kanban-ui settings panel without a page reload.

## 2. Constraints & Assumptions
- M4 sidecar exposes the HTTP CRUD endpoints and an SSE endpoint defined in `packages/contracts` DTOs; exact route paths and event payloads are taken from M4's plan, not redefined here.
- Provider interface (`PersistenceProvider`, `subscribe`, `capabilities`, `Unsubscribe`) is already defined in `packages/contracts` from M2.
- Only two providers are user-selectable in this milestone: `localStorage` and `http`. No "auto-detect" mode.
- Provider URL is a single base URL string; auth is out of scope (sidecar is local-only per main plan).
- SSE is the only live channel; no WebSocket fallback.
- `kanban-ui` is a Vite + TypeScript app; framework-specific UI integration patterns are decided by M3 and reused here.
- All wire payloads are validated with Zod v4 schemas already exported from `packages/contracts`.
- Settings persistence uses the same `localStorage` namespace prefix established in M2/M3.
- Out of scope: multi-board switching (M9), conflict resolution UI (M6/M7), authentication, TLS configuration.

## 3. Deliverables (Definition of Done)
- [ ] New workspace package `packages/provider-http/` published privately, implementing `PersistenceProvider` against the sidecar.
- [ ] HTTP client performs CRUD for Items, Columns, Swimlanes, Boards using contract DTOs.
- [ ] SSE subscriber consumes the sidecar event stream and fans out to `subscribe()` handlers.
- [ ] Reconnect with exponential backoff + jitter; bounded max delay; resets on successful open.
- [ ] Connection state (`connecting`, `online`, `offline`, `reconnecting`) is observable from the UI.
- [ ] Settings UI in `apps/kanban-ui/` lists provider options, accepts a sidecar base URL, validates URL format, and persists the selection in `localStorage`.
- [ ] Provider rebind happens in-place: prior subscriptions are torn down, new provider is constructed, board state is reloaded, subscriptions are re-established — all without a page reload.
- [ ] Connection-status indicator surfaces in the UI chrome and updates within the configured timeout.
- [ ] Agent-browser scenarios exist under `apps/kanban-ui/agent-browser/m5/` and pass via `pnpm --filter kanban-ui verify:m5`.
- [ ] Unit tests cover HTTP client mapping and reconnect/backoff logic with fake timers.

## 4. Step-by-Step Execution Plan

### Step 1: Scaffold `packages/provider-http`
**Objective:** Create a new workspace package wired into the monorepo.

**Files:**
- `packages/provider-http/package.json` (create)
- `packages/provider-http/tsconfig.json` (create)
- `packages/provider-http/src/index.ts` (create)
- `packages/provider-http/README.md` (create)
- `pnpm-workspace.yaml` (modify, only if package globbing needs adjustment)

**Actions:**
1. Create package with name `@awesome-markdown/provider-http`, private, ESM, type-module.
2. Add dependencies on `@awesome-markdown/contracts` and `zod` (v4); no UI framework dependency.
3. Extend `tsconfig.base.json` with strict settings; emit declarations.
4. Export the provider factory and the connection-state union from `src/index.ts`.

**Rules:**
- Must not import from `apps/*`.
- Must not depend on `provider-localstorage`.

**Output:**
- Empty but typechecking package consumable from `apps/kanban-ui`.

---

### Step 2: Define HTTP client surface
**Objective:** Map every `PersistenceProvider` CRUD method to a sidecar HTTP call.

**Files:**
- `packages/provider-http/src/http-client.ts` (create)
- `packages/provider-http/src/endpoints.ts` (create)

**Actions:**
1. Create a thin HTTP client wrapper around `fetch` with: base URL, JSON request/response handling, abort-signal pass-through, and error normalization to a typed error.
2. Enumerate the sidecar endpoints (Item/Column/Swimlane/Board CRUD) referencing the route shapes defined in M4's plan; do not redefine payloads.
3. Validate every response body against the matching Zod schema from `@awesome-markdown/contracts`; reject on schema failure.
4. Surface HTTP non-2xx as a typed `ProviderHttpError` carrying status + parsed sidecar error payload.

**Rules:**
- Must reuse contract DTOs; must not redeclare entity shapes.
- Must not log request/response bodies.
- Must accept an injected `fetch` for tests.

**Output:**
- Typed HTTP boundary used by the provider.

---

### Step 3: Implement SSE subscriber with reconnect/backoff
**Objective:** Maintain a live event stream from the sidecar and expose connection state.

**Files:**
- `packages/provider-http/src/sse-client.ts` (create)
- `packages/provider-http/src/connection-state.ts` (create)

**Actions:**
1. Create an SSE client built on the browser `EventSource` API targeting the sidecar's event endpoint.
2. Parse each event payload with the contract event-union schema; drop and warn on invalid payloads.
3. Implement exponential backoff with jitter on `error`/close: start at a small base delay, double up to a bounded ceiling, reset on `open`.
4. Track and emit a `ConnectionState` (`idle | connecting | online | reconnecting | offline`) via an internal observable accessor.
5. Expose `start()`, `stop()`, `getState()`, and `onStateChange(handler)`.
6. Allow injection of an `EventSource` constructor for tests.

**Rules:**
- Must close prior `EventSource` before opening a new one.
- Must stop reconnecting once `stop()` is called.
- Must not retain handlers after `stop()`.

**Output:**
- Reusable SSE client with observable connection state.

---

### Step 4: Compose the HTTP `PersistenceProvider`
**Objective:** Combine the HTTP client and SSE subscriber behind the provider contract.

**Files:**
- `packages/provider-http/src/provider.ts` (create)
- `packages/provider-http/src/index.ts` (modify)

**Actions:**
1. Implement a `createHttpProvider({ baseUrl, fetch?, eventSourceCtor? })` factory returning an object satisfying `PersistenceProvider`.
2. Map CRUD methods to the HTTP client.
3. Implement `subscribe(handler)` by attaching to the SSE client's event fan-out and returning an `Unsubscribe` that detaches that handler only (does not stop the SSE client unless last).
4. Start the SSE client lazily on the first `subscribe` call; stop it when the last handler unsubscribes.
5. Set `capabilities` discriminator to identify this provider as `http` and to declare live-update support.
6. Expose `getConnectionState()` and `onConnectionStateChange()` as provider-extension methods (not part of the base interface) for the UI indicator.

**Rules:**
- Must not block CRUD methods on SSE state.
- Must propagate `AbortSignal` from CRUD callers.

**Output:**
- Drop-in `PersistenceProvider` with live updates.

---

### Step 5: Add provider-selection settings model in `kanban-ui`
**Objective:** Represent the user's provider choice and the active connection state in the UI.

**Files:**
- `apps/kanban-ui/src/settings/provider-settings.ts` (create)
- `apps/kanban-ui/src/settings/storage.ts` (create)

**Actions:**
1. Define a `ProviderSettings` type as a discriminated union: `{ kind: 'localStorage' }` or `{ kind: 'http', baseUrl: string }`.
2. Add a Zod v4 schema for `ProviderSettings`; validate on read.
3. Persist and load settings in a dedicated `localStorage` key (e.g. `awesome-markdown:provider-settings`).
4. Default to `{ kind: 'localStorage' }` when no setting is stored or schema parsing fails.

**Rules:**
- Must never throw on corrupted storage; must fall back to default and log once.
- Must keep the storage key namespaced.

**Output:**
- Typed, validated settings persistence.

---

### Step 6: Build the settings panel UI
**Objective:** Let users pick a provider and provide a sidecar URL.

**Files:**
- `apps/kanban-ui/src/settings/SettingsPanel.*` (create — extension matches M3's UI framework)
- `apps/kanban-ui/src/settings/url-validation.ts` (create)
- `apps/kanban-ui/src/app-shell/*` (modify to mount a settings entry point in the chrome)

**Actions:**
1. Add a settings entry (icon/button) in the app chrome; opens a modal or drawer.
2. Render a provider radio list: "Local browser storage" and "Local FS sidecar (HTTP/SSE)".
3. When `http` is selected, show a base-URL text input with inline validation (must parse as `http(s)` URL).
4. Add a "Test connection" affordance that performs a lightweight health check against the entered URL.
5. On save: persist via Step 5 storage and trigger the rebind flow (Step 7).
6. Disable save while validation fails.

**Rules:**
- Must not submit on invalid URL.
- Must show the current active provider and connection state inline.
- Must be keyboard-accessible.

**Output:**
- User-facing provider switcher.

---

### Step 7: Implement runtime provider rebind
**Objective:** Swap the active provider in place without a page reload.

**Files:**
- `apps/kanban-ui/src/providers/active-provider.ts` (create)
- `apps/kanban-ui/src/providers/provider-factory.ts` (create)
- `apps/kanban-ui/src/board/board-state.ts` (modify)
- `apps/kanban-ui/src/main.ts` (modify)

**Actions:**
1. Centralize provider access behind an `ActiveProviderRegistry` that owns the current `PersistenceProvider` instance and a list of attached subscribers.
2. On rebind: call all registered teardown callbacks; call `Unsubscribe` on every active subscription; dispose the previous provider (including stopping its SSE client if applicable).
3. Construct the new provider via `provider-factory.ts` based on `ProviderSettings`.
4. Reload board state by re-fetching all boards/columns/items/swimlanes through the new provider.
5. Re-subscribe board-state listeners against the new provider.
6. Update the connection-state indicator binding to read from the new provider (or a static "n/a" for `localStorage`).

**Rules:**
- Must guarantee no events from the old provider are delivered after rebind.
- Must not leave orphaned `EventSource` connections.
- Must show a transient "switching provider" UI state during reload.

**Output:**
- Hot provider swap with clean teardown.

---

### Step 8: Connection-status indicator
**Objective:** Surface SSE connection health in the UI chrome.

**Files:**
- `apps/kanban-ui/src/app-shell/ConnectionIndicator.*` (create)
- `apps/kanban-ui/src/app-shell/*` (modify to mount it)

**Actions:**
1. Render a small status pill/dot reflecting `online | reconnecting | offline | n/a`.
2. Subscribe to the active provider's connection-state observable when present; render `n/a` for `localStorage`.
3. Show a tooltip/title with the current sidecar URL and last state-change timestamp.

**Rules:**
- Must update within 1s of a state change.
- Must remain accessible (ARIA label reflects state text).

**Output:**
- Always-visible connection indicator.

---

### Step 9: Author agent-browser scenarios for M5
**Objective:** Encode UC-6 acceptance as reproducible UI scenarios.

**Files:**
- `apps/kanban-ui/agent-browser/m5/switch-to-http.scenario.*` (create)
- `apps/kanban-ui/agent-browser/m5/sse-online-indicator.scenario.*` (create)
- `apps/kanban-ui/agent-browser/m5/sidecar-restart-reconnect.scenario.*` (create)
- `apps/kanban-ui/agent-browser/m5/switch-back-isolation.scenario.*` (create)
- `apps/kanban-ui/agent-browser/m5/README.md` (create)

**Actions:**
1. Scenario 1: open settings, select HTTP provider, enter sidecar URL, save; assert board reloads from sidecar state and is distinct from prior localStorage state.
2. Scenario 2: assert connection indicator transitions to "online" within a defined timeout after rebind.
3. Scenario 3: trigger a sidecar restart (out-of-band script invoked by the scenario harness); assert indicator goes `reconnecting` then returns to `online` without manual refresh; assert no console errors.
4. Scenario 4: switch back to localStorage; perform an edit; switch to HTTP again; assert localStorage edits are not present in HTTP view, and HTTP edits are not present in localStorage view.
5. Document in the scenario README the prerequisites (sidecar binary, port) and how the harness restarts it.

**Rules:**
- Must run headless and produce a JUnit-or-equivalent report consumable by CI.
- Must clean up the sidecar process and `localStorage` between scenarios.

**Output:**
- Four passing scenarios covering UC-6.

---

### Step 10: Wire `verify:m5` script
**Objective:** Provide the milestone command.

**Files:**
- `apps/kanban-ui/package.json` (modify)
- `apps/kanban-ui/agent-browser/m5/run.*` (create)

**Actions:**
1. Add a `verify:m5` script to `apps/kanban-ui/package.json` that boots a sidecar instance, builds/serves the UI, and runs the scenarios in `agent-browser/m5/`.
2. Ensure the script exits non-zero if any scenario fails or if any orphan child process remains.

**Rules:**
- Must be invocable as `pnpm --filter kanban-ui verify:m5` from repo root.
- Must not require any global install beyond what root `pnpm install` provides.

**Output:**
- One-command milestone verification.

---

### Step 11: Unit tests for provider internals
**Objective:** Lock in HTTP mapping and reconnect behavior.

**Files:**
- `packages/provider-http/test/http-client.test.ts` (create)
- `packages/provider-http/test/sse-client.test.ts` (create)
- `packages/provider-http/test/provider.test.ts` (create)

**Actions:**
1. Cover CRUD round-trip with an injected `fetch` stub; assert Zod validation rejects malformed responses.
2. Cover SSE client with a fake `EventSource`; drive `error` events and assert backoff schedule using fake timers; assert state transitions emit in order.
3. Cover provider's lazy SSE start/stop based on subscriber count.

**Rules:**
- Must use Vitest (consistent with M2).
- Must not hit the network.

**Output:**
- Green Vitest suite for `provider-http`.

---

## 5. Data Model / Schema

**Entity: ProviderSettings (UI-local)**
- Fields: `kind` (`'localStorage' | 'http'`), `baseUrl` (string, required when `kind === 'http'`).
- Constraints: `baseUrl` must be a valid `http`/`https` URL; trimmed; no trailing slash normalization required but applied at read time.
- Storage: single `localStorage` key, JSON-encoded, Zod-validated on read.

**Entity: ConnectionState (runtime, not persisted)**
- Values: `idle | connecting | online | reconnecting | offline`.
- Transitions: `idle → connecting → online`; `online → reconnecting → online`; any → `offline` on `stop()`.

No new wire schemas: HTTP DTOs and SSE event union are already defined in `packages/contracts` (M1).

## 6. Use Case Implementation

**Use Cases Covered:**
- UC-6: Provider switch at runtime — this milestone implements the entire user-visible flow (settings → rebind → reload → resubscribe).

**Layer Responsibility:**
- `packages/provider-http`: provides the HTTP/SSE implementation of `PersistenceProvider` and its connection-state surface.
- `apps/kanban-ui`: provides the settings UI, the `ActiveProviderRegistry` rebind machinery, and the connection indicator.

**Interface Notes:**
- `getConnectionState` / `onConnectionStateChange` are provider-extension methods exposed only by the HTTP provider; the UI feature-detects via `capabilities`.

## 7. Validation & Verification

**Agent-browser scenarios** (`apps/kanban-ui/agent-browser/m5/`):
- `switch-to-http.scenario.*` — verifies provider rebind reloads board state from sidecar.
- `sse-online-indicator.scenario.*` — verifies indicator reaches `online` within timeout.
- `sidecar-restart-reconnect.scenario.*` — verifies auto-reconnect after sidecar restart, no manual refresh.
- `switch-back-isolation.scenario.*` — verifies state isolation between providers.

**Milestone command:**
- `pnpm --filter kanban-ui verify:m5` boots sidecar + UI and runs all four scenarios.

**Unit tests:**
- `pnpm --filter @awesome-markdown/provider-http test` runs Vitest suite from Step 11.

**Manual checks:**
- Open DevTools Network tab, confirm a single `EventSource` connection exists when HTTP provider is active and zero when localStorage provider is active.
- Confirm `localStorage` contains the namespaced settings key after save.

## 8. Rollback Strategy
- All new code lives in `packages/provider-http/` and additive paths under `apps/kanban-ui/src/settings/`, `src/providers/`, `src/app-shell/`. Reverting the milestone is a clean delete of these directories plus the `verify:m5` script and the scenarios folder.
- No data migration: settings storage uses a new key; absence reverts to localStorage default.
- M3, M4 remain functional independently if M5 is reverted.

## 9. Open Questions
- Exact SSE event endpoint path and event-name conventions are owned by M4; if M4 finalizes a heartbeat/keepalive event, this provider should treat it as a no-op rather than an entity change — flag for cross-check during integration.
- Whether the connection indicator should also expose a manual "Reconnect now" action — deferred; not required by UC-6.
- Whether to debounce rapid reconnect cycles in the UI indicator to avoid flicker — deferred to M6 once real watcher traffic exists.
- Whether `provider-http` should retry idempotent CRUD on transient 5xx — deferred; current scope is single-attempt with typed error surfacing.

## 10. References
- Main plan: `ai-docs/awesome-markdown-main.md` (UC-6, M5 row, Section 6 AC-9, Section 7 verification matrix).
- M4 milestone plan: `ai-docs/awesome-markdown-m4.md` (sidecar HTTP routes, SSE event contract).
- MDN — Server-Sent Events overview: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- MDN — `EventSource`: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- WHATWG HTML — Server-sent events spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
- Zod v4 documentation: https://zod.dev/
- MDN — `fetch` with `AbortSignal`: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- Exponential backoff with jitter (AWS Architecture Blog): https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- pnpm workspaces: https://pnpm.io/workspaces
- Vitest fake timers: https://vitest.dev/api/vi.html#vi-usefaketimers
