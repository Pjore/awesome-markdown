# Markdown-Driven Domain Realignment — Design Outline

> Output of the `grill-me` design session. Intended as **input to an
> implementation planning session**, not as an implementation plan itself.
> Companion document: [markdown-driven-domain-grill.md](markdown-driven-domain-grill.md)
> (full session transcript + decision rationale).

## 1. Vision

The kanban system is reframed as **a flat pool of self-sufficient markdown
items, visualized through 2D query-based boards**. Items carry their own
properties; boards declare what to show and how to lay it out. The UI is a
projection, not a source of truth.

### Guiding principles
- **Markdown is the driving factor.** Each `.md` file is a complete,
  portable record. Folder structure and filename carry no system meaning.
- **Items are self-sufficient.** No foreign keys to a single owning board.
- **Boards are queries.** Membership is derived from filters, not declared.
- **Definitions are cosmetic + behavioral rules.** Friendly title, sort
  rule, optional WIP limit, optional drop-write override.
- **Graceful fallbacks.** UI works when an axis definition is missing
  (slug-fallback) or when a property is absent (sort-tiebreak).
- **Single-file write on every drop.** Eliminates a class of merge
  conflicts; preserves the existing sync-engine as-is.

## 2. Entity Model

Three entity types, discriminated by `entityType` in frontmatter:
`item | board | axis`.

### 2.1 Item

```yaml
---
entityType: item
slug: add-dark-mode-toggle      # auto-derived from title at creation,
                                # numeric suffix on collision, decoupled
                                # from title afterward
title: Add dark mode toggle
status: in-progress             # arbitrary item-global properties …
priority: high
tags: [ui, settings]
dueDate: 2026-06-01
assignee: alice
order: a0M                      # global fractional-index order (optional)
boards:                         # per-board property bag (optional)
  - board: dev-tasks
    order: a0G                  # per-board fractional-index order
    note: blocked-on-design     # arbitrary additional fields allowed
  - board: release-1.2
    order: a1
createdAt: 2026-04-20T10:00:00Z
updatedAt: 2026-05-02T07:49:15Z
---

## Description
Markdown body — preserved as-is, NOT queryable in v1.
```

**Identity:** `slug` only. No ULID `id`.
**`boards[]`:** purely a property bag. **Never** affects membership.
Membership is determined entirely by filter rules.

### 2.2 Board

```yaml
---
entityType: board
slug: dev-tasks
title: Dev Tasks
description: Day-to-day engineering work
filter:                          # optional: scopes the candidate set
  all:
    - { property: status, in: [open, in-progress, in-review, done] }
columns: [todo, in-progress, in-review, done]    # ordered list of axis slugs
swimlanes: [priority-high, priority-medium, priority-low]
createdAt: …
updatedAt: …
---
```

Boards do not store items. The `columns` / `swimlanes` arrays are
ordered references to axis slugs and define the board's layout.

### 2.3 Axis

```yaml
---
entityType: axis
slug: in-progress
title: In Progress
description: Actively being worked on
filter:                          # optional; default = match-all
  property: status
  equals: in-progress
order:                           # optional sort rule; default below
  by: boards.$board.order        # dotted path with $board substitution
  direction: asc
writeOnDrop: …                   # optional override; default derived from filter
---
```

One axis = one bucket. The same axis slug may be referenced under
`columns:` on one board and under `swimlanes:` on another.

**Slug-fallback:** if an item's filter properties cause it to land in a
column whose axis slug has no definition file, the UI synthesizes a
column with `title = slug` and no description.

## 3. Filter Rule Grammar

Recursive predicate tree. Same grammar at all three levels (board,
column, swimlane).

### 3.1 Leaf operators

| Operator | Type | Invertible? | Inverse write |
|---|---|---|---|
| `equals: x` | scalar | yes | `set property = x` |
| `in: [x]` (length 1) | scalar | yes | `set property = x` |
| `in: [x, y, …]` (length ≥ 2) | scalar | **no** | read-only |
| `has: x` | array | yes | `append x` (idempotent) |
| `lacks: x` | array | yes | `remove x` (idempotent) |
| `exists: false` | any | yes | `delete property` |
| `exists: true` | any | **no** | read-only |
| `gt`/`gte`/`lt`/`lte: n` | number/date | **no** | read-only |
| `matches: /regex/` | string | **no** | read-only |

### 3.2 Boolean composition

| Node | Invertible? | Inverse write |
|---|---|---|
| `all: [...]` | iff every child invertible | union of all child writes |
| `any: [...]` | **no** | read-only |
| `not: { exists: true }` | yes | `delete property` |
| `not: <other>` | **no** | read-only |

### 3.3 Property paths

Dotted paths with one context substitution variable.

- `priority`, `tags`, `status`, `dueDate` — item-global properties.
- `boards.$board.order`, `boards.$board.note` — per-board property bag,
  resolved against the board currently being rendered.
- `order` — global fractional-index order field.

### 3.4 Strict invertibility policy (α)

If **any** part of a cell's combined filter (board ∧ column ∧ swimlane)
is non-invertible, the **entire cell is read-only** for both drag-drop
and "+ Add". No partial inverse application. UI shows a no-drop cursor
with explanatory tooltip.

### 3.5 `writeOnDrop` exception override

Flat list of mutations, used when the default-derived inverse is wrong
or when a non-invertible filter still needs a writable interpretation:

```yaml
writeOnDrop:
  - { set: priority, to: high }
  - { append: tags, value: urgent }
  - { delete: assignee }
  # OR
  - readonly: true   # mutually exclusive with set/append/delete entries
```

Expected to be used in **exception cases only**; defaults handle the
common path.

## 4. Drag-and-Drop & Creation Semantics

### 4.1 Drop into cell `(column = X, swimlane = L)` on board B

1. Compute the **combined filter** for the destination cell:
   `B.filter ∧ X.filter ∧ L.filter`.
2. Run invertibility analysis on the combined filter.
3. If non-invertible (and no `writeOnDrop` override resolves it) →
   **drop rejected**, item snaps back.
4. Otherwise: derive the **mutation list** by walking the filter tree
   plus any explicit `writeOnDrop` entries.
5. Some mutations target paths under `boards.$board.*`. If at least one
   such mutation exists and the item has no `boards[]` entry for `B`,
   **lazily create** that entry, populated only with the fields the
   mutations touch. If all mutations target item-global paths, **no
   `boards[]` entry is created**.
6. Apply mutations to a single file (the item's `.md`). One write,
   one git commit.

### 4.2 Reorder within a column

Order keys are **fractional-index strings** (lexicographic, e.g. `a0`,
`a0V`, `a1`). There is always room between any two values, so
reordering never requires renumbering siblings. **One file mutated per
drop, always.**

### 4.3 Creation in cell `(X, L)`

Same writeOnDrop derivation, but the new file additionally carries:
- `entityType: item`
- `slug` — auto-derived from title via slugify(title), with `-2`/`-3`/…
  suffix if collision.
- `title`, `createdAt`, `updatedAt`
- Body (initially empty or template).

If the cell is read-only (per § 3.4), "+ Add" is disabled in that cell.

### 4.4 Default sort tiebreak

When a column's order rule is missing or its `order.by` path is absent
on an item, fall back to `updatedAt desc` as universal tiebreak.

## 5. File Layout & Identity

- **Single content root:** `./content/` (configurable). All `.md` files
  with `entityType` frontmatter are entities; others are silently
  ignored. Arbitrary nesting allowed; system never reads meaning from
  paths.
- **Filename = `<slug>.md`** at the root of `content/` for v1. (No
  per-entityType auto-bucketing in v1; humans may organize via
  subfolders if they wish.)
- **Identity = slug, per-type namespace.** Boards and axes can share a
  slug; items have their own namespace.
- **No `id` field**, **no `schemaVersion` field**.

## 6. Provider Surfaces

### 6.1 provider-fs (Fastify sidecar)

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /boards/:slug/render` | GET | Returns `{ board, axes, cells: [{ column, swimlane, items }] }` with all filters evaluated server-side. Primary read path for the UI. |
| `GET /boards/:slug/homeless` | GET | Returns items with `boards[]` entries pointing at this board that no longer match any column filter. |
| `GET /boards` | GET | List of board summaries. |
| `GET /axes` | GET | List of axis summaries (for the slug-fallback to verify presence). |
| `GET /items/:slug` | GET | Single item read. |
| `PATCH /items/:slug` | PATCH | Apply mutation list. Single-file write. |
| `POST /items` | POST | Create. |
| `DELETE /items/:slug` | DELETE | Remove. |
| `GET /lint/untagged` *(optional)* | GET | List `.md` files lacking `entityType`. Operator convenience. |

The existing `/subscribe` SSE channel is reused unchanged.

### 6.2 provider-localstorage

Updated to the new schemas in lockstep. The filter evaluator must be
importable from a shared package (likely `packages/contracts`) so both
provider-fs and provider-localstorage share one implementation.

### 6.3 provider-http

Confirmed actively used by kanban-ui (Settings panel routes the FS
provider through it). Updated in lockstep with provider-fs's new
endpoint shapes.

### 6.4 sync-engine

**No changes.** Engine is content-agnostic; watches `content/**/*.md`,
debounces, commits, pushes/pulls. Single-file-per-drop invariant means
existing per-file git conflict detection covers all concurrency cases.

## 7. UI Behavior Highlights

- Boards rendered from `/boards/:slug/render`.
- Drag-and-drop computes mutation list client-side using the shared
  filter evaluator + invertibility analyzer; sends `PATCH /items/:slug`.
- Optimistic UI; reverts on PATCH failure.
- Read-only cells show no-drop cursor + tooltip; "+ Add" hidden.
- Slug-fallback rendering for axis slugs without definition files.
- Per-board "homeless items" view, populated from `/boards/:slug/homeless`.
- **Board/axis definition editing is file-only in v1.** No UI editor.

## 8. Migration / Cutover

- **No migration script, no back-compat shims.** Clean break.
- **Wipe `content/boards/board-demo/`** and existing
  `content/item-*.md`, replace with curated demo content under
  `content/`:
  - 3 items exercising different paths (with/without `boards[]`,
    different priorities/tags).
  - 2 boards: one with a board-level filter, one without.
  - 5+ axes including:
    - At least one axis reused as columns on one board AND swimlanes on
      another.
    - At least one axis with a non-invertible filter (creates a
      read-only cell when combined with another axis).
    - At least one axis with an explicit `writeOnDrop` override.
- The curated demo doubles as living documentation of the model.

## 9. Out of Scope (v1)

- Back-compat / legacy schemas.
- UI editor for board / axis definitions (file-edit only).
- Body-content filter operators.
- `schemaVersion` field.
- WIP limits — field removed entirely; may be reintroduced later if needed.
- `customFields` open-ended catch-all — removed; clean break, no legacy.
- Multi-bucket axis dimensions (rejected: each axis = one bucket).
- Auto-pruning of stale `boards[]` entries (homeless view surfaces them).
- Bulk-edit / undo / history (git is the history).

## 10. Known Open Detail Points (for the planner)

- **Path-syntax grammar for `$board` substitution** — escape rules for
  slugs containing dots, paths through nested `customFields`. Specify
  before the contracts package is finalized.
- **Filter evaluator placement** — must be shared between provider-fs
  (server) and provider-localstorage (browser). Likely lives in
  `packages/contracts` or a sibling utility package.
- **Slug-collision recovery UX** — validator catches collisions on load,
  but the recovery flow (rename via UI? CLI lint? banner?) is
  unspecified.
- **PATCH coalescing** — fast successive drops generate multiple
  PATCHes; UI should debounce optimistically. Not a correctness issue
  under fractional-index ordering; flagged for verification.
- **Lint endpoint** — `GET /lint/untagged` is optional. Planner may
  drop if it bloats milestone scope.

## 11. Definition of Done (high-level)

- New schemas, filter evaluator, and invertibility analyzer in
  `packages/contracts`, with full Vitest coverage of operator
  invertibility and boolean composition.
- provider-fs serves `/boards/:slug/render` and the other endpoints in §6.1
  against the new schemas; flat-scan + in-memory index implemented.
- provider-localstorage and provider-http aligned to new contracts.
- kanban-ui renders boards via `/render`, performs drag-drop with
  derived writeOnDrop, supports creation, surfaces homeless items, and
  handles slug-fallback.
- Curated demo content present at `./content/`.
- All `pnpm test` suites pass; `pnpm verify:ui` passes against the new
  demo content.
- README and `.github/copilot-instructions.md` updated to describe the
  new domain model.
- Sync-engine and its tests unchanged.

---

**Next step:** feed this outline into a planning session
(`Planner` agent) to produce
`ai-docs/markdown-driven-domain-realignment-main.md`
(replacing the existing stub) and per-milestone files.
