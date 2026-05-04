# Implementation Plan: markdown-driven-domain

> Source design: [markdown-driven-domain-outline.md](markdown-driven-domain-outline.md)
> (companion: [markdown-driven-domain-grill.md](markdown-driven-domain-grill.md))

## 0. Metadata
- **Complexity:** 5
- **Uncertainty:** 2
- **Work:** 5
- **Scope:** Realign awesome-markdown around a flat pool of self-sufficient
  markdown items projected through query-based boards. Replace the existing
  board-owns-items model across `packages/contracts`, both providers,
  `provider-http`, and `kanban-ui`. Author curated demo content. Update docs.
- **Non-goals:**
  - Back-compat / migration shims (clean break, demo content rewritten).
  - UI editor for board / axis definition files (file-edit only in v1).
  - Body-content filter operators.
  - `schemaVersion`, WIP limits, `customFields` open catch-all.
  - Multi-bucket axis dimensions.
  - Auto-pruning of stale `boards[]` entries.
  - Bulk-edit / undo / history (git is the history).
  - `GET /lint/untagged` operator endpoint.
  - Slug-collision recovery UX (validator reports; recovery is manual).
  - Sync-engine internals (no changes; remains content-agnostic).

## 1. Problem Statement
The current model couples items to a single owning board via folder layout
and foreign keys, forcing multi-file writes for cross-board moves and
preventing items from appearing on multiple boards under different rules.
Boards, columns, and swimlanes are hard-coded UI concepts rather than data,
so users cannot define new views, axes, or reuse buckets across boards
without code changes.

## 2. Constraints & Assumptions
- Markdown files are the source of truth; UI is a projection.
- Identity is `slug`, namespaced per `entityType`. No ULID `id`.
- One drop = one file mutated, always. Sync-engine and its conflict logic
  remain unchanged.
- Filter evaluator must be isomorphic (Node + browser) and shared.
- Strict invertibility policy α: any non-invertible part of a combined
  cell filter makes the entire cell read-only; no partial inverses.
- Fractional-index strings used for `order`; never renumber siblings.
- Single content root `./content/`; arbitrary nesting allowed; filename
  carries no system meaning beyond `<slug>.md` convention.
- Files lacking `entityType` frontmatter are silently ignored.
- Zod v4 throughout, imported from `"zod"`.
- TypeScript source files ≤ 400 lines.

## 3. Target State (Definition of Done)

**Functional:**
- Items, boards, and axes are independent `.md` files under `content/`.
- `kanban-ui` renders any board by querying server-evaluated cell contents.
- Drag-drop derives a mutation list from the destination cell's combined
  filter, applies it via a single `PATCH /items/:slug`, and rejects drops
  on read-only cells with a no-drop cursor + tooltip.
- Reorder uses fractional-index keys; one file mutated per drop.
- Items not matching any column on a board they reference are surfaced
  via the per-board homeless view.
- Missing axis definition files render via slug-fallback (title = slug).
- Curated demo content under `content/` exercises: axis reuse across
  boards, a non-invertible (read-only) cell, and a `writeOnDrop` override.

**Non-functional:**
- One filter-engine implementation imported by `provider-fs`,
  `provider-localstorage`, and `kanban-ui`.
- No `any` in `packages/contracts` or `packages/filter-engine`.
- Sync-engine code and tests untouched.
- `pnpm typecheck && pnpm lint && pnpm test` green at workspace root.
- `pnpm verify:ui` green against the new demo content.

**Success Criteria:**
- [ ] All entity files validate against new Zod schemas.
- [ ] Filter-engine has Vitest coverage for every operator's
      invertibility, boolean composition, and mutation derivation.
- [ ] `GET /boards/:slug/render` returns correct cells for the demo
      boards (verified by integration test).
- [ ] Drag-drop in `kanban-ui` mutates exactly one file per drop
      (verified by agent-browser scenario observing FS state).
- [ ] Read-only cell shows no-drop cursor and hides "+ Add"
      (agent-browser verified).
- [ ] Homeless view lists items whose `boards[]` entry no longer
      matches any column.
- [ ] Slug-fallback renders a column with `title = slug` when the axis
      file is absent.
- [ ] README and `.github/copilot-instructions.md` describe the new
      domain model.

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `packages/contracts/src/schemas/` | Modify | Replace item/board/swimlane schemas with `item`/`board`/`axis` discriminated by `entityType`; add filter-rule schema and mutation-list schema. |
| `packages/contracts/src/dtos.ts` | Modify | Add board-render and homeless DTOs; remove obsolete board-children DTOs. |
| `packages/filter-engine` | New | Filter evaluator, invertibility analyzer, mutation-list deriver, fractional-index helpers; pure TS, no I/O. |
| `apps/provider-fs/src/fs/` | Modify | Flat scan of `content/**/*.md`; in-memory typed index keyed by `(entityType, slug)`; ignore files without `entityType`. |
| `apps/provider-fs/src/routes/` | Modify | Replace board/column/swimlane/item routes with: `GET /boards`, `GET /axes`, `GET /boards/:slug/render`, `GET /boards/:slug/homeless`, `GET /items/:slug`, `POST /items`, `PATCH /items/:slug`, `DELETE /items/:slug`. SSE channel preserved. |
| `apps/provider-fs/test/` | Modify | Replace fixtures + tests for new shapes; add render & homeless tests. |
| `packages/provider-localstorage/src/` | Modify | Re-implement against new contracts; reuse `filter-engine` to evaluate render/homeless in browser. |
| `packages/provider-http/src/` | Modify | Update client to new endpoint shapes. |
| `apps/kanban-ui/src/board/` | Modify | Render via `/boards/:slug/render`; client-side mutation derivation via `filter-engine`; optimistic PATCH; revert on failure. |
| `apps/kanban-ui/src/board/` (dnd) | Modify | Compute combined-filter invertibility client-side; show no-drop cursor + tooltip; gate "+ Add" per cell. |
| `apps/kanban-ui/src/board/` (homeless) | New | Per-board homeless items panel. |
| `content/` | Modify | Wipe `content/boards/board-demo/` and `content/item-*.md`; author curated demo (3 items, 2 boards, 5+ axes). |
| `README.md`, `docs/ARCHITECTURE.md`, `.github/copilot-instructions.md` | Modify | Describe the new flat-pool / boards-as-queries model. |
| `apps/sync-engine/` | Unchanged | Out of scope; verified untouched. |

## 5. Use Cases

### UC-1: Author creates an item
**Actor:** User (via `kanban-ui` "+ Add" in a cell, or by writing a `.md` file directly).
**Trigger:** Click "+ Add" in writable cell, or new file appears in `content/`.
**Flow:**
1. User invokes creation in cell `(column = X, swimlane = L)` on board B.
2. UI derives `writeOnDrop` mutation list from `B.filter ∧ X.filter ∧ L.filter`.
3. UI auto-derives `slug` from title (slugify; numeric suffix on collision).
4. UI sends `POST /items` with `{ slug, title, mutations, body }`.
5. Provider writes a single `<slug>.md` under `content/` with frontmatter
   (`entityType: item`, `createdAt`, `updatedAt`, properties from mutations).
6. SSE broadcasts a content-changed event; all clients re-fetch render.

**Input:** title, destination cell coordinates, optional body.
**Output:** new item visible in destination cell on all clients.
**Errors:** read-only cell → "+ Add" disabled; slug collision → suffix retry; write failure → user-facing error toast.

### UC-2: User views a board
**Actor:** User.
**Trigger:** Navigate to board route in `kanban-ui`.
**Flow:**
1. UI requests `GET /boards/:slug/render`.
2. Provider loads board definition, resolves `columns[]` and `swimlanes[]`
   to axis definitions (or slug-fallback synthesis for missing axes).
3. Provider scans the in-memory item index, filters by `B.filter`,
   then bucketizes each item into `(column, swimlane)` cells whose
   axis filters all match. An item may appear in zero or multiple cells.
4. Provider sorts each cell by the column's `order` rule (fallback
   `updatedAt desc`).
5. Provider returns `{ board, axes, cells: [{ column, swimlane, items }] }`.
6. UI renders the grid; cells whose combined filter is non-invertible
   are flagged read-only.

**Input:** board slug.
**Output:** board grid with items in cells.
**Errors:** unknown board slug → 404; malformed board file → validator error surfaced in UI.

### UC-3: User drags item between cells
**Actor:** User.
**Trigger:** Drop event on destination cell.
**Flow:**
1. UI computes `B.filter ∧ X.filter ∧ L.filter` for the destination.
2. UI runs invertibility analysis (filter-engine).
3. If non-invertible and no `writeOnDrop` override resolves it → drop rejected; item snaps back; tooltip shown.
4. Otherwise UI derives the mutation list (filter-walk + explicit override entries).
5. If any mutation targets `boards.$board.*` and the item lacks a `boards[]` entry for B, UI lazily includes a "create boards entry" mutation.
6. UI sends `PATCH /items/:slug` with the mutation list; applies optimistically.
7. Provider applies mutations in a single file write; one git commit (via sync-engine watcher).
8. SSE broadcasts; siblings re-fetch.
9. On PATCH failure, UI reverts optimistic change.

**Input:** item slug, destination cell coordinates.
**Output:** updated item frontmatter; cell membership changes accordingly.
**Errors:** read-only cell → reject with no-drop cursor; PATCH 4xx/5xx → revert + toast.

### UC-4: User reorders item within a column
**Actor:** User.
**Trigger:** Drop within the same column at a new index.
**Flow:**
1. UI computes a fractional-index between the item's new neighbors using filter-engine helpers.
2. UI sends `PATCH /items/:slug` with a single mutation: `set <order-path> = <new-key>` (path resolved from the column's `order.by`).
3. One file written; one commit.

**Input:** item slug, neighbors in destination order.
**Output:** new ordering reflected on next render.
**Errors:** identical to UC-3.

### UC-5: User views homeless items for a board
**Actor:** User.
**Trigger:** Open homeless panel on board B.
**Flow:**
1. UI requests `GET /boards/:slug/homeless`.
2. Provider returns items with a `boards[]` entry referencing B that match no column under `B.filter`.
3. UI renders a flat list with link to each item.

**Input:** board slug.
**Output:** list of homeless items.
**Errors:** unknown board → 404.

### UC-6: User edits item content or properties via file
**Actor:** User (external editor) or sync-engine (incoming git pull).
**Trigger:** File change under `content/`.
**Flow:**
1. provider-fs watcher (existing) detects change, re-parses, updates index.
2. Provider broadcasts SSE `content-changed`.
3. UI re-fetches affected board renders.

**Input:** filesystem write.
**Output:** UI reflects change ≤ debounce window.
**Errors:** parse failure → file logged & ignored; UI unaffected.

### UC-7: System renders graceful fallback for missing axis
**Actor:** System.
**Trigger:** Board references an axis slug whose definition file does not exist.
**Flow:**
1. Provider includes the slug in the render response with `synthetic: true`, `title = slug`, no description, no filter, no order rule.
2. UI renders the column/swimlane normally; cells under it use `match-all` and inherit `updatedAt desc` sort.
3. Drops into a synthetic cell follow standard invertibility rules against the remaining (board ∧ other-axis) filter.

**Input:** board file referencing an unknown axis slug.
**Output:** functional cell labeled by slug.
**Errors:** none — this is a fallback, not an error.

### Contracts

**Contract: filter-engine ↔ providers/UI**
- **Provider:** `packages/filter-engine`
- **Consumer:** `apps/provider-fs`, `packages/provider-localstorage`, `apps/kanban-ui`
- **Shape:**
  - `evaluate(filter, item, ctx) → boolean`
  - `analyzeInvertibility(filter) → { invertible: boolean, reasons: string[] }`
  - `deriveMutations(filter, ctx, override?) → Mutation[] | { readonly: true }`
  - `compareOrderKeys(a, b) → number`, `keyBetween(a?, b?) → string`
  - `ctx` carries the active `$board` slug for path substitution.

**Contract: provider render envelope**
- **Provider:** `provider-fs`, `provider-localstorage`
- **Consumer:** `kanban-ui`
- **Shape:**
  - `BoardRender = { board, axes: { columns: Axis[], swimlanes: Axis[] }, cells: Cell[] }`
  - `Cell = { columnSlug, swimlaneSlug, readOnly: boolean, items: Item[] }`
  - Synthetic axes carry `synthetic: true`; client treats them like any other.

**Contract: PATCH mutation list**
- **Provider:** `kanban-ui`
- **Consumer:** providers
- **Shape:** `Mutation = { set, to } | { append, value } | { remove, value } | { delete }` with a single `path` field; paths use dotted notation with `$board` substitution resolved client-side before sending.

## 6. Milestones

### Milestone 1: Contracts realignment
**Objective:** Replace old schemas with the new entity model and DTOs in `packages/contracts`.

**Deliverables:**
- `entityType`-discriminated Zod schemas for `item`, `board`, `axis`.
- Recursive filter-rule schema covering all leaf operators and boolean composition.
- Mutation-list schema (`set` / `append` / `remove` / `delete`).
- Board-render and homeless-items DTO schemas.
- Removal of obsolete board/column/swimlane/item schemas.
- Vitest coverage for schema acceptance/rejection of representative fixtures.

**Use Cases:** type surface for UC-1, UC-2, UC-3, UC-4, UC-5, UC-7.

**Complexity:** 3 | **Work:** 3

---

### Milestone 2: Filter engine package
**Objective:** Stand up `packages/filter-engine` as the single isomorphic implementation of evaluation, invertibility analysis, mutation derivation, and fractional-index helpers.

**Deliverables:**
- New workspace package `packages/filter-engine` (no Node-only or browser-only deps).
- `evaluate`, `analyzeInvertibility`, `deriveMutations`, fractional-index helpers per §5 contract.
- Path resolver supporting dotted paths with `$board` substitution.
- Exhaustive Vitest coverage: every operator's invertibility, boolean composition rules, default `writeOnDrop` derivation, override handling, fractional-index ordering invariants.

**Use Cases:** behavioral substrate for UC-2, UC-3, UC-4, UC-7.

**Complexity:** 4 | **Work:** 4

---

### Milestone 3: provider-fs realignment
**Objective:** Rebuild provider-fs around a flat content scan + in-memory typed index, exposing the new endpoint set.

**Deliverables:**
- Flat recursive scan of `content/**/*.md` ignoring untagged files.
- In-memory index keyed by `(entityType, slug)` with type-narrowed lookups.
- Endpoints: `GET /boards`, `GET /axes`, `GET /boards/:slug/render`, `GET /boards/:slug/homeless`, `GET /items/:slug`, `POST /items`, `PATCH /items/:slug`, `DELETE /items/:slug`.
- Render endpoint applies `B.filter`, bucketizes via `filter-engine`, sorts per column rule with `updatedAt desc` tiebreak, and synthesizes missing axes (`synthetic: true`).
- Existing `/subscribe` SSE channel preserved.
- Test fixtures rewritten; integration tests cover: render bucketization, homeless detection, slug-fallback, mutation-list PATCH single-file-write, slug-collision suffix on POST.

**Use Cases:** UC-1, UC-2, UC-3, UC-4, UC-5, UC-6, UC-7 (server portion).

**Complexity:** 5 | **Work:** 5

---

### Milestone 4: provider-localstorage and provider-http alignment
**Objective:** Bring the in-browser provider and HTTP client to the new contract in lockstep with provider-fs.

**Deliverables:**
- `provider-localstorage` re-implemented against new schemas; uses `filter-engine` to evaluate `render` and `homeless` in-browser.
- `provider-http` updated to call new endpoints and surface new DTOs.
- Vitest suites for both providers updated to new fixtures and contracts; behavioral parity assertions where reasonable.

**Use Cases:** UC-1, UC-2, UC-3, UC-4, UC-5 (alternate persistence path).

**Complexity:** 3 | **Work:** 3

---

### Milestone 5: kanban-ui rewrite for boards-as-queries
**Objective:** Drive the UI from the render envelope; perform mutation-derived drag-drop with read-only cell handling and homeless view.

**Deliverables:**
- Board view fetches `/boards/:slug/render`; renders grid from cells.
- Drag-drop computes combined-filter invertibility + mutation list client-side via `filter-engine`; sends single `PATCH /items/:slug`; optimistic + revert on failure.
- Read-only cells display no-drop cursor + tooltip; "+ Add" hidden in those cells.
- Slug-fallback rendering for synthetic axes.
- Per-board homeless items panel populated from `/boards/:slug/homeless`.
- Settings/runtime provider selection unchanged.
- agent-browser scenarios covering: writable drop, read-only-cell drop rejection, reorder within column, "+ Add" in writable cell, homeless panel, slug-fallback column rendering.

**Use Cases:** UC-1, UC-2, UC-3, UC-4, UC-5, UC-7 (UI portion).

**Complexity:** 5 | **Work:** 5

---

### Milestone 6: Curated demo content
**Objective:** Replace existing demo content with a hand-authored set that exercises and documents the new model.

**Deliverables:**
- Wipe `content/boards/board-demo/` and existing root `content/item-*.md`.
- Author 3 items: at least one with no `boards[]` entry, one with a `boards[]` entry per defined board, varied tags/priorities/dueDates.
- Author 2 boards: one with `B.filter` scoping the candidate set, one without.
- Author ≥5 axes including:
  - One axis reused as a column on board A and as a swimlane on board B.
  - One axis with a non-invertible filter that, combined with another axis, produces a read-only cell.
  - One axis with an explicit `writeOnDrop` override.
- README snippet pointing readers at this content as living documentation.

**Use Cases:** living-doc for UC-2, UC-3, UC-7.

**Complexity:** 2 | **Work:** 2

---

### Milestone 7: Documentation update
**Objective:** Bring narrative docs in line with the new model.

**Deliverables:**
- README rewrite: flat-pool / boards-as-queries framing, file layout, drop semantics summary, link to demo content.
- `docs/ARCHITECTURE.md` updated for the new layering and filter-engine package.
- `.github/copilot-instructions.md` updated: new domain model, filter-engine package, endpoint list.
- `docs/VERIFICATION.md` updated agent-browser scenarios.

**Use Cases:** documentation for all UCs.

**Complexity:** 2 | **Work:** 2

---

**Review Checkpoint:** After creating this main plan, pause for user review before generating detailed milestone files.

## 7. Validation & Verification
- `pnpm typecheck && pnpm lint` clean at workspace root.
- `pnpm test` green: contracts schema tests, filter-engine operator/composition tests, provider-fs route tests, provider-localstorage tests, provider-http tests.
- `pnpm verify:ui` green against curated demo content.
- agent-browser scenarios for: writable drop, read-only drop rejection, reorder, "+ Add", homeless panel, slug-fallback.
- Sync-engine test suite untouched and still green (regression guard).
- Manual spot-check: a single drop produces exactly one git commit touching one `.md` file.

## 8. Rollback Strategy
- Entire change rides on a feature branch; revert by abandoning the PR.
- No data migration: demo content is intentionally rewritten, so reverting the PR restores prior demo content from git.
- Sync-engine code/tests untouched, so rollback risk is bounded to the rewritten layers.

## 9. Open Questions
- Path-syntax escaping rules for slugs containing dots (resolve in M1 schema work).
- PATCH coalescing under fast successive drops — verify in M5 agent-browser; not a correctness issue under fractional-index ordering, but worth measuring.
- Exact ergonomics of slug-collision feedback on POST (suffix is automatic; surfacing the rename to the user is M5 polish).

## 10. References
- Outline: [markdown-driven-domain-outline.md](markdown-driven-domain-outline.md)
- Grill transcript: [markdown-driven-domain-grill.md](markdown-driven-domain-grill.md)
- Zod v4: https://zod.dev/
- Fastify v5: https://fastify.dev/docs/latest/
- @dnd-kit: https://docs.dndkit.com/
- Fractional indexing background: https://observablehq.com/@dgreensp/implementing-fractional-indexing
