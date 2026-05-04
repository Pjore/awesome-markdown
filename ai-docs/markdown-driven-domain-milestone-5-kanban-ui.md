# Milestone 5: kanban-ui rewrite for boards-as-queries

## Metadata
- Parent plan: [markdown-driven-domain-main.md](markdown-driven-domain-main.md)
- Complexity / Work: 5 / 5
- Depends on: M1 (contracts), M2 (filter-engine), M3 (provider-fs).
  M4 (provider-localstorage / provider-http) is helpful for parity but
  not required for the agent-browser run, which targets the
  `kanban-ui` + `provider-fs` path.
- Use cases: UC-1, UC-2, UC-3, UC-4, UC-5, UC-7 (UI portion)

## Objective
Rewrite [apps/kanban-ui/src/](../apps/kanban-ui/src/) so the board view is
driven by the server's render envelope and drag-drop is expressed as
mutation-list `PATCH /items/:slug` calls derived client-side from the
destination cell's combined filter. Provider selection (Settings),
runtime provider switching, and SSE reconnect logic carry over with no
behavioral change; only data flow, drop semantics, and creation flow
change.

## Scope

**In:**
- Board view fetches `GET /boards/:slug/render` through the active
  provider and renders the grid from `cells` keyed by
  `(columnSlug, swimlaneSlug)`. Synthetic axes render with
  `title = slug`, no description, and otherwise behave like real axes.
- Drag-drop pipeline: invertibility analysis → mutation derivation →
  optimistic apply → single `PATCH /items/:slug` → revert on failure.
  Includes the lazy "create `boards[]` entry for B" mutation when the
  derived list mutates `boards.$board.*` and the item lacks an entry.
- Reorder-within-column path uses `keyBetween` from `filter-engine`
  and emits one `set <order-path> = <new-key>` mutation per drop.
- Read-only cell UX: no-drop cursor during hover, tooltip explaining
  why (surfaced from `analyzeInvertibility` reasons), and "+ Add"
  hidden.
- "+ Add" in writable cells: derives mutations from the cell filter
  (with `writeOnDrop` overrides), slugifies the title, and sends
  `POST /items`. Surfaces server-applied collision suffix back to the
  user.
- Per-board homeless items panel populated from
  `GET /boards/:slug/homeless`.
- SSE handling: on `content-changed`, re-fetch the active board's
  render and homeless list. Existing reconnect/backoff behavior
  preserved.
- Six new agent-browser scenarios under
  [apps/kanban-ui/agent-browser/](../apps/kanban-ui/agent-browser/) in a
  new `m-domain/` folder, one per scenario listed in
  *Definition of Done*.

**Out:**
- Provider implementation changes (M3/M4 own those).
- Settings UI changes beyond what's needed to keep provider selection
  working against the new endpoint set.
- Editor for board / axis / item frontmatter (file-edit only, per main
  plan §0).
- New global state library or routing framework — keep current stack.
- Demo content authoring (M6) and README/architecture docs (M7).
- Slug-collision recovery UX beyond surfacing the server-assigned slug.
- Bulk operations, undo, multi-select drag.

## Constraints
- Mutation derivation, invertibility analysis, fractional-index
  helpers, and `$board` path substitution come from
  `packages/filter-engine`. Do not re-implement any of that logic in
  the UI.
- One drop = exactly one `PATCH /items/:slug` request. Reorder is also
  one PATCH. Verify in agent-browser scenarios by counting network
  requests.
- Optimistic updates must be reverted on PATCH failure with a
  user-visible toast; no silent rollbacks.
- Source files ≤ 400 lines. Split board view, dnd controller,
  mutation-derivation glue, and homeless panel into separate modules
  rather than growing existing files.
- Keep imports of `@awesome-markdown/contracts` and
  `@awesome-markdown/filter-engine` typed; no `any` in the UI layer
  newly added by this milestone.

## Contracts
None new. UI consumes the M1 render envelope, homeless DTO, and
mutation-list shape; calls `filter-engine` per its M2 surface; sends
`POST /items` and `PATCH /items/:slug` per M3.

## Definition of Done
- [ ] Board view renders any board returned by
      `GET /boards/:slug/render`, including boards with synthetic
      axes, without code changes per board.
- [ ] Drag between writable cells issues a single `PATCH /items/:slug`
      whose mutation list matches what `filter-engine.deriveMutations`
      returns for the destination cell, with the `boards[]`-entry
      mutation auto-included when applicable.
- [ ] Drop on a read-only cell is rejected before any network call;
      no-drop cursor and tooltip are shown during hover.
- [ ] Reorder within a column emits one PATCH with one `set` mutation
      whose value is a fractional key strictly between the new
      neighbors.
- [ ] "+ Add" is hidden in read-only cells and, in writable cells,
      results in a single `POST /items` whose returned slug (with any
      collision suffix) is reflected in the UI.
- [ ] Homeless panel for board B lists exactly the items returned by
      `GET /boards/:slug/homeless` and refreshes on `content-changed`.
- [ ] Slug-fallback columns and swimlanes render with `title = slug`
      and remain interactable under standard invertibility rules.
- [ ] On PATCH/POST failure, optimistic state reverts and a toast is
      shown; subsequent retries are not blocked.
- [ ] SSE `content-changed` triggers a re-fetch of the active board's
      render and homeless list; reconnect/backoff behavior matches
      pre-milestone behavior (regression check).
- [ ] Six agent-browser scenarios live under
      [apps/kanban-ui/agent-browser/m-domain/](../apps/kanban-ui/agent-browser/),
      one folder each, runnable individually and aggregated by
      `pnpm verify:ui`:
      writable-drop, read-only-drop-rejection, reorder-within-column,
      add-in-writable-cell, homeless-panel, slug-fallback-column.
      Each scenario asserts the network/file invariant relevant to
      its case (single PATCH, zero PATCH, single mutation, single
      POST, etc.).
- [ ] `pnpm typecheck && pnpm lint` pass; existing kanban-ui Vitest
      suites updated and green; `pnpm verify:ui` green against the
      content that exists at the time of this milestone (M6 content
      may not yet exist — scenarios provision their own minimal
      fixtures via provider-fs's content root if needed).

## Risks & Decisions To Get Right
- **Single source of mutation truth.** The UI must call
  `filter-engine.deriveMutations` and send the result verbatim.
  Resist the temptation to "patch up" the mutation list in the view
  layer — any adjustment belongs in `filter-engine`.
- **Invertibility check before optimistic apply.** Run the analyzer
  before mutating local state, so a rejected drop never causes a
  visible flicker.
- **`$board` substitution timing.** Substitute `$board` once, in the
  UI, immediately before sending the PATCH. Do not send unresolved
  `$board` paths to the server.
- **Read-only-cell affordances are presentational, not enforcement.**
  The server is still the authority; the UI hides "+ Add" and shows
  the no-drop cursor for UX, but a malformed mutation list must still
  be rejected by the provider in tests.
- **SSE storm coalescing.** Coalesce rapid `content-changed` events
  into a single re-fetch per board (debounce ~100 ms). Do not let
  fast successive drops trigger N parallel render fetches.
- **Agent-browser scenario isolation.** Each scenario folder follows
  the layout already used under
  [apps/kanban-ui/agent-browser/](../apps/kanban-ui/agent-browser/);
  scenarios must clean up their fixtures so they can run in any
  order and in parallel where possible. Reference
  [.github/skills/agent-browser/references/awesome-markdown-notes.md](../.github/skills/agent-browser/references/awesome-markdown-notes.md)
  for testid / seeding / DnD conventions.
- **Toast / error surface.** Reuse whatever toast mechanism already
  exists in `kanban-ui`; do not introduce a new notification system
  for this milestone.

## Open Questions
None blocking. Slug-collision UX polish and PATCH coalescing under
rapid drops are tracked in the main plan §9 and are acceptable to
land as minimal-but-correct here, with refinement deferred.
