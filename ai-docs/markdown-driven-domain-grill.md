# Markdown-Driven Domain Realignment — Grill-Me Session Report

> Report of a `grill-me` interview session that resolved the design tree for
> realigning the awesome-markdown domain model around self-sufficient,
> portable markdown items and a query-based board visualization model.

## 1. Starting Point

The user opened with this brief:

> Currently we have domains (zod schemas), yaml files (columns, swimlanes),
> and item files (md files with frontmatter). All needs to be aligned. How
> could we make this more scaleable and resilient? The markdown should be
> the driving factor.
>
> Item files should be self sufficient and portable, still support board
> data such as column and order. One item should be able to be represented
> in multiple boards with different column and order. Other properties are
> item specific (title, tags, priority). Board, Column and Swimlane
> definitions should act more as cosmetic (friendly column name, DoD) and
> carry rules such as WIP-limit. Kanban UI should still work even if an
> item is using a column that has no definition yet (slug fallback). We
> should not rely on folder structure or file name; instead a flat list of
> md files where an `entityType` frontmatter property declares whether each
> file is an item, board, column, etc.

### Initial codebase state surveyed

- **Schemas** (`packages/contracts/src/schemas/`):
  `Board { id, slug, title, ... }`, `Column { id, boardId, title, order, wipLimit }`,
  `Swimlane { id, boardId, title, order, color }`,
  `Item { id, boardId, columnId, swimlaneId, title, status, priority,
  tags, customFields }` — items carried hard-coded foreign keys to a single
  board, plus `_order` smuggled inside `customFields`.
- **On-disk** (`content/boards/board-demo/`):
  per-board folder with `board.yaml`, `columns.yaml`, `swimlanes.yaml`,
  and `items/*.md`. Folder structure encoded board membership; filename
  encoded item identity.
- **Providers**: `provider-fs` (file-backed, Fastify), `provider-localstorage`
  (browser), `provider-http` (HTTP client wrapping provider-fs).
- **Sync-engine**: content-agnostic git sync layer; watches `**/*.md`.

## 2. The Conceptual Pivot

The first half of the session refined the user's stated direction. The
second half delivered a **major reframing** that simplified the model
dramatically:

> The Kanban UI is only a visualization with a number of axes; primarily
> column and swimlane. … column has one (optional) filter rule … and one
> (optional) ordering rule, swimlane has the same setup. … There is a
> default behaviour defined so the UI will work even if an item is missing
> an expected property or if column/swimlane is defined without
> order/filter rule.

This changed the model from **"items have explicit per-board placements"**
to **"boards are 2D queries over a global pool of items"**. Membership
becomes derived; placements become unnecessary except as an optional
property bag for per-board overrides.

A second user-driven refinement crystallized the per-board overrides:

> Item should have `item.boards[boardProperties]`, e.g.
> `boards = [{ board: "board-slug", order: 500, arbitrary-prop: "blue" }]`.
> Item could also have `item.order` property. If two boards use the same
> ordering property then a drag-n-drop in one board will affect the other.

This made `boards[]` an **open-ended typed property bag** — not a
membership signal — keyed by board slug, with arbitrary additional fields
that columns/swimlanes may reference by path.

## 3. Decision Tree (in resolution order)

### Q1 — Where does per-board placement live?
**Resolution: A — placement on the item.**
Initially modeled as `placements: Record<slug, { column, swimlane, order }>`,
later replaced by the more general `boards[]` property bag (Q4).

### Q2 — Membership shape
**Resolution: A2 — sparse object, `column` required when present.**
(Subsequently superseded by the query model in Q4 — placements removed
entirely.)

### Q3 — Column/swimlane sort & group rules
**Resolution: column = sort spec; swimlane = explicit assignment + own sort.**
Introduced the idea that columns/swimlanes declare arbitrary property paths
for ordering. (Subsequently generalized in Q4 to filter+order rules.)

### Q4 — The reframing: boards as queries
**Resolution: D3 with smart defaults; M1 (boards[] is pure property bag);
lazy `boards[]` entry creation on drop only when needed; typed-with-catchall
schema; dotted paths with `$board` substitution.**

Membership is purely query-driven. Drag-and-drop writes the inverse of
the destination cell's filters (D3); columns auto-default to read-only
when their filter is non-invertible. Cross-axis drop writes both axes.
Boards may declare an optional top-level filter scoping the candidate set.

### Q5 — Filter rule grammar
**Resolution: F2 — recursive predicate tree with `all`/`any`/`not`,
constrained leaf operator set:**

| Operator | Invertible? | Inverse write |
|---|---|---|
| `equals: x` | yes | set property = x |
| `in: [x]` (length 1) | yes | set property = x |
| `in: [...]` (length >1) | no | read-only |
| `has: x` | yes | append x to array |
| `lacks: x` | yes | remove x from array |
| `exists: false` | yes | delete property |
| `exists: true` | no | read-only |
| `gt`/`gte`/`lt`/`lte` | no | read-only |
| `matches: /regex/` | no | read-only |

Boolean composition: `all` invertible iff all children invertible; `any`
never invertible; `not` only on `exists: true → exists: false`.

`writeOnDrop` exception override: flat list of `{ set | append | delete }`
mutations or `readonly: true`.

Strict α policy: any non-invertible part of a cell's combined filter →
entire cell read-only (no partial inverse application).

### Q6 — Flat layout, identity, discriminator
**Resolutions:**
- **E2** — single `axis` entity type for both columns and swimlanes
  (entityType enum: `item | board | axis`).
- **I2 + 2b** — slug-only identity for *all* entity types, including items.
  Item slugs auto-derived from title at creation, numeric suffix on
  collision (`fix-login-bug-2`), decoupled from title afterward.
- **P2** — silently ignore `.md` files without `entityType` (allows the
  workspace to coexist with regular markdown content).
- **Per-type slug namespace** — board and axis can share a slug.
- **Single content root with arbitrary nesting** — paths are pure
  cosmetics; system never reads meaning from path.

### Q7 — Drop write semantics & sync-engine
**Resolutions:**
- **7a-ii** — fractional-index strings (lexicographic) for order, not
  numeric. Single-file-mutation guarantee on every drop; eliminates
  neighbor-renumbering edge cases and reduces merge conflicts.
- **7b-β** — UI surfaces a "homeless items" view per board: items with
  `boards[]` entries that no longer match any column filter.
- **7c-1** with twist — `GET /boards/:slug/render` returns
  `{ board, axes, cells: [{ column, swimlane, items }] }` with filters
  applied server-side. Mutations stay on `PATCH /items/:slug`.
- **No new conflict machinery** — existing per-file git conflict detector
  is sufficient under the single-file-write guarantee.

### Q8 — Migration
**Resolutions:**
- **M2** — wipe `content/boards/board-demo/` and reseed with curated demo
  content that exercises the full new model (board-level filter, axis
  reused as both columns and swimlanes, read-only column).
- **8.2-a** — `provider-localstorage` updated in lockstep with the new
  contracts.
- **provider-http** — confirmed actively used by kanban-ui (Settings
  panel routes the FS provider through it); aligned in lockstep.
- **sync-engine** — content-agnostic; no changes needed.
- **UI is read-only for board/axis definitions in v1**; def authoring is
  via editing files only.

### Q9 — Creation & demo set
**Resolutions:**
- **9a** — Item creation in cell `(col, lane)` writes title + slug +
  timestamps + the same writeOnDrop outputs that a drop would. "+ Add"
  button is greyed out on read-only cells (same rule as drop).
- **9b-1** — All items live at the configured single root
  (`./content/`). Filename = `<slug>.md`. No auto-bucketing by
  entity type.
- **9c-no** — No `schemaVersion` field. If/when needed later, add then.
- **9d** — Frontmatter-only filters in v1. No body-grep operators.
- **9e-bucket** — Each axis definition = one bucket (one column or one
  swimlane). A board's `columns: [todo, in-progress, done]` is an
  ordered list of three axis slugs. Same axis slug can appear under
  `columns:` on one board and `swimlanes:` on another.

## 4. In Scope (for the realignment milestone[s])

- New Zod schemas in `packages/contracts`: `item`, `board`, `axis`,
  filter rule grammar (recursive `all`/`any`/`not` + leaf operators),
  `writeOnDrop` flat-mutation list.
- Filter evaluator + invertibility analyzer.
- Provider-fs:
  - Flat `**/*.md` scan with `entityType` discriminator.
  - In-memory index keyed by `(entityType, slug)`.
  - `GET /boards/:slug/render` (server-side filter eval).
  - `PATCH /items/:slug` (single-file write).
  - Untagged-files lint endpoint (optional housekeeping).
- Provider-localstorage and provider-http updated in lockstep.
- Kanban-UI:
  - Renders boards from the `/render` payload.
  - Drag-and-drop computes writes via the writeOnDrop derivation.
  - "+ Add card" flow in cells (gated by read-only check).
  - Homeless-items view per board.
  - Slug-fallback rendering for item-referenced columns/swimlanes that
    have no axis definition.
- Curated demo content (`content/`):
  - 3 items, 2 boards, 5+ axes, exercising:
    - Board-level filter
    - Axis reused as columns on one board and swimlanes on another
    - At least one read-only (non-invertible) cell
    - At least one item with no `boards[]` entry that still appears via
      global property filters
- Updated tests: contracts schema, provider-fs route tests, UI smoke.

## 5. Out of Scope

- **Back-compat / legacy** — no migration script, no legacy schemas
  retained, no fallbacks to old shapes.
- **UI editor for board/axis definitions** — file-edit only in v1.
- **Body-content filters** (e.g. `body.contains: …`).
- **`schemaVersion` field** in frontmatter.
- **Bulk editing, undo, history** beyond what git already provides.
- **Auto-pruning of stale `boards[]` entries** — homeless items view
  surfaces them; user/agent decides what to do.
- **WIP-limit enforcement** — axis schema may carry the field but
  enforcement is not part of this realignment.
- **Multi-bucket axis dimensions** — `9e-dimension` was rejected; one
  axis = one bucket.
- **Numeric `order` with neighbor renumbering** — replaced by
  fractional-index strings.

## 6. Outstanding & Conflicting Matters

### Resolved tensions worth re-flagging
- **"Different order per board" vs "no per-board state"** — resolved by
  making `boards[]` an open-ended property bag. Per-board ordering is
  a special case of "any per-board property a column can reference by
  path", not a privileged concept.
- **"Slug-only identity" vs "items are anonymous content"** — resolved
  via 2b auto-derivation + numeric suffix. Items still feel anonymous to
  authors (they just type a title); the slug is a derived consequence.
- **"Single-file write on drop" vs "numeric order with gap exhaustion"**
  — resolved by 7a-ii fractional indexes. Single-file write is now an
  invariant.

### Genuinely open / deferred
- **Path syntax edge cases for `$board`** — `boards.$board.order` is the
  agreed grammar, but corner cases (escaping a dot in a board slug, paths
  through deeply nested `customFields`) need a small grammar spec during
  implementation. Likely a milestone-1 sub-task in the contracts package.
- **Filter evaluator location for the localstorage provider** — server
  evaluates for provider-fs, but the localstorage provider has no server.
  The evaluator must therefore be importable from `packages/contracts` (or
  a shared util package) so both contexts share one implementation.
  Implementation detail; flagged for the planner.
- **Coalescing of rapid drops** — if a user drags fast, multiple `PATCH`
  requests may queue. The fractional-index scheme tolerates this fine
  (every drop produces a valid intermediate position), but the UI should
  debounce optimistically. Not a blocker; verification scope.
- **WIP-limit field on axis** — agreed to keep the field in the schema
  for forward compat, but enforcement is out of scope. Need to decide:
  schema field name, type (`number | { soft: number, hard: number }`?).
  Defer to planner.
- **What happens when an item's slug collides with another item via git
  merge** — covered conceptually (validator catches on next load with a
  clear error) but the recovery UX is unspecified. Likely needs a small
  CLI lint or a UI banner. Defer.
- **Lint endpoint for "untagged" md files (P2 housekeeping)** — flagged
  in scope as optional. Pure operator convenience; planner can drop if
  it bloats milestone surface.

### Conflicts with existing repo content
- The existing main plan stub at
  [ai-docs/markdown-driven-domain-realignment-main.md](ai-docs/markdown-driven-domain-realignment-main.md)
  predates this session. The decisions above will require it to be
  regenerated or substantially revised — it currently references concepts
  (e.g. `Column` and `Swimlane` as separate types, items with `boardId`)
  that have been replaced.
- `apps/provider-fs/test/fixtures/` and the demo at
  `content/boards/board-demo/` will be replaced by the curated demo set.

## 7. Where We Ended

A complete, internally consistent domain model in which:
- **Items are self-sufficient markdown files** with intrinsic properties
  and an optional `boards[]` typed property bag for per-board overrides.
- **Boards are 2D query/visualization specs** with optional top-level
  filters and ordered references to axis slugs along two dimensions.
- **Axes are reusable single-bucket definitions** combining a filter
  (read), an order rule, and an optional `writeOnDrop` exception.
- **Drag-and-drop semantics derive automatically** from the destination
  cell's filters, with a strict "any non-invertible part = read-only
  cell" policy and an explicit override hatch.
- **Identity is slug-based across all entity types**; filename and folder
  structure carry no system meaning.
- **The sync-engine is unchanged**; the existing per-file git conflict
  detector handles all concurrency cases under the single-file-write
  invariant.

The next step is a planning session that turns this into an
implementation plan. The companion document
[markdown-driven-domain-outline.md](markdown-driven-domain-outline.md)
captures the resulting design as planning input.
