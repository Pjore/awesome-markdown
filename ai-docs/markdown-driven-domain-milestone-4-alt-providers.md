# Milestone 4: provider-localstorage and provider-http alignment

## Metadata
- Parent plan: [markdown-driven-domain-main.md](markdown-driven-domain-main.md)
- Complexity / Work: 3 / 3
- Depends on: M1 (contracts), M2 (filter-engine), M3 (provider-fs)
- Use cases: UC-1, UC-2, UC-3, UC-4, UC-5

## Objective
Bring the two non-fs persistence layers — `packages/provider-localstorage`
and `packages/provider-http` — to the new flat-pool / boards-as-queries
contract established by M1–M3. After this milestone, all three providers
expose an identical surface so `kanban-ui` (M5) can be written against one
contract regardless of selected backend.

## Scope

**In:**
- Re-implement `packages/provider-localstorage` against the new
  `entityType`-discriminated schemas from M1 and the render/homeless
  semantics implemented by provider-fs in M3.
- Update `packages/provider-http` to target the new endpoint set
  (`GET /boards`, `GET /axes`, `GET /boards/:slug/render`,
  `GET /boards/:slug/homeless`, `GET /items/:slug`, `POST /items`,
  `PATCH /items/:slug`, `DELETE /items/:slug`) and surface new DTOs from
  `@awesome-markdown/contracts`.
- Preserve `provider-http`'s existing SSE subscription behavior unchanged
  in semantics; only update event payload typing if M3 changed it.
- Replace fixtures and test suites in both packages to match new
  schemas, endpoints, and request/response shapes.
- Add a behavioral-parity test layer asserting that, given the same
  fixture set, `provider-localstorage` and `provider-http` (pointed at a
  mocked provider-fs) return equivalent render envelopes for the demo
  boards — including cell membership, ordering, and synthetic-axis flags.

**Out:**
- Any change to `apps/provider-fs`, `packages/contracts`, or
  `packages/filter-engine`. M4 consumes them; it does not modify them.
- `kanban-ui` integration — that is M5. Provider-side test mocks are
  fine; UI wiring is not.
- Sync-engine, content authoring, and documentation rewrites.
- Storage migration from any prior `provider-localstorage` layout.
  Clean break: existing browser state is discarded on first load.
- Performance work beyond what falls out of using `filter-engine` directly.

## Constraints
- Zod v4 only, imported from `"zod"`. No `any` in any cross-package type.
- `provider-localstorage` must remain browser-pure: no Node-only deps.
  Filter evaluation, invertibility, and ordering go through
  `packages/filter-engine` — do not re-implement evaluation locally.
- TypeScript source files ≤ 400 lines.
- Both providers must implement the same exported provider interface
  surface from `@awesome-markdown/contracts` (`packages/contracts/src/provider.ts`).
- `provider-localstorage` must mirror provider-fs render semantics
  exactly: slug-fallback synthesis for missing axes (`synthetic: true`,
  `title = slug`), `updatedAt desc` tiebreak after column-defined order,
  and items appearing in zero or multiple cells per the combined filter.
- `provider-http` must not introduce a fetch wrapper abstraction beyond
  what already exists; align with current client style.

## Contracts
This milestone does not introduce new cross-boundary contracts. It conforms
both providers to the contracts already defined in M1 (entity schemas,
mutation list, BoardRender, homeless DTO) and the filter-engine surface
from M2.

## Storage layout (provider-localstorage)
Flat keyed store keyed by `(entityType, slug)`; entries hold the parsed
entity record plus `createdAt` / `updatedAt` timestamps. No board-owns-items
relationship and no per-board indexes — boards are evaluated as queries
over the flat pool exactly as in provider-fs.

## Behavioral notes (provider-localstorage)
- `GET /boards/:slug/render` and `GET /boards/:slug/homeless` are
  synthesized in-browser by walking the keyed store through `filter-engine`
  with the same evaluation, sort, and synthesis rules as provider-fs.
- `POST` derives `slug` from title via the shared slugify helper (M1) and
  applies a numeric suffix on collision against the keyed store.
- `PATCH` applies the mutation list to a single item record atomically
  and bumps `updatedAt`.
- `DELETE` removes the single keyed entry.
- A change-event channel equivalent to SSE is emitted to in-process
  subscribers so the UI sees parity with provider-fs.

## Definition of Done
- [ ] `provider-localstorage` exports the same provider interface as
      provider-fs and passes its own Vitest suite against new fixtures
      covering: render bucketization, homeless detection, slug-fallback
      synthesis, `updatedAt desc` tiebreak, mutation-list PATCH single-record
      write, POST slug derivation + collision suffix, DELETE.
- [ ] `provider-http` Vitest suite mocks each new endpoint and asserts
      request method, path, and body shape; response parsing is validated
      against the M1 DTO schemas; SSE subscription test covers connect,
      event delivery, and disconnect.
- [ ] A parity test fixture (shared between the two packages) drives both
      providers with the same items/boards/axes and asserts equivalent
      `BoardRender` output for the demo boards. Differences in transport-
      level metadata are tolerated; cell composition, order, and synthetic
      flags must match.
- [ ] No `any` in the public type surface of either package.
- [ ] `pnpm typecheck && pnpm lint` clean; existing workspace test suites
      remain green; provider-fs and filter-engine tests untouched.

## Risks & Decisions To Get Right
- Parity tests must drive both providers through the *same* provider
  interface, not through bespoke per-package APIs. If the interface from
  `packages/contracts/src/provider.ts` is insufficient, surface that as
  an Open Question rather than diverging the providers.
- `provider-localstorage` must call into `filter-engine` for evaluation,
  invertibility, ordering, and synthesis. Do not duplicate any of that
  logic inside the package, even "just for the browser path".
- For `provider-http`, prefer a thin client: one function per endpoint,
  Zod-parse the response with the M1 DTOs, and let errors surface. Do
  not invent retry, caching, or normalization layers.
- Mock provider-fs in `provider-http` tests at the HTTP boundary
  (e.g. fetch interception) so the assertions cover wire shape, not
  internal client structure.
- Keep the change-event channel in `provider-localstorage` simple — an
  in-memory emitter is sufficient. Do not attempt cross-tab broadcast
  in this milestone.

## Open Questions
- Whether the parity-test fixture lives in a new shared test-utils
  package or is duplicated under each provider's `test/fixtures/`.
  Default: duplicate for now; extract only if M5 needs the same fixtures.
