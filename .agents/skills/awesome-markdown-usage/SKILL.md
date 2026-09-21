---
name: awesome-markdown-usage
description: Author and edit the markdown content that drives the kanban system — item, board, and axis files in content/, filter rules, columns/swimlanes, and drag-and-drop write behavior. Use whenever asked to add/edit a board, column, swimlane, axis, or item, to write a filter rule, to make a cell writable/read-only, or to explain why a card landed in /homeless.
---

# Kanban Content Authoring

Everything in `content/` is a markdown file with an `entityType` frontmatter field: `item`, `board`, or `axis`. Schemas: `packages/contracts/src/schemas/{item,board,axis,filter-rule,mutation}.ts`.

## Core principle: boards don't own items

An item's `boards[]` array only *registers interest* in a board (and optionally carries a per-board `order` key). Actual placement into a column/swimlane cell is derived at render time by evaluating each cell's filter rule against the item pool. Editing `boards[]` does not move a card between columns — editing the property the filter checks does.

- If an item is in `boards[]` for a board but matches no column filter, it shows up in that board's `/homeless` view (`GET /boards/:slug/homeless`).
- The same axis slug can be reused as a column on one board and a swimlane on another (see `priority-high` axis: column on `board-dev`, swimlane on `board-all`).

## Entity essentials

**Item** — required: `entityType: item`, `slug`, `title`, `createdAt`, `updatedAt`. Everything else (`status`, `priority`, `tags`, `project`, ...) is freeform passthrough — there is no fixed enum; valid values are implicitly whatever axis filters check for. `boards[]` entries are `{ board: <slug>, order?: <string>, ...passthrough }`.

**Board** — required: `entityType: board`, `slug`, `title`. Optional `filter` narrows the candidate set before columns/swimlanes are applied. `columns`/`swimlanes` are ordered arrays of axis slugs (referenced, not embedded). `cardLayout`/`detailLayout` pick which properties to display and how (`text | badge | tag | avatar`).

**Axis** — required: `entityType: axis`, `slug`, `title`. `filter` decides membership in this bucket (absent = catch-all). `order` sorts items within the bucket (`by` a dotted path, `direction: asc|desc`; defaults to `updatedAt desc` when absent). Referencing an axis slug that has no file synthesizes a fallback (`title = slug`, `synthetic: true`) — no error.

## Filter rules

A filter is a leaf `{ property, <op>: value }` or a boolean node `{ all: [...] }` / `{ any: [...] }` / `{ not: rule }`. Leaf ops: `equals`, `in`, `has` (array contains), `lacks` (array excludes), `exists`, `gt`/`gte`/`lt`/`lte`, `matches` (regex). `property` is a dotted path; `$board` is a special segment substituted with the current board slug (e.g. `boards.$board.order`) and also used for `boards[]` entry lookup (finds the entry whose `board` field equals the key). Full operator/invertibility table: [references/filter-dsl.md](./references/filter-dsl.md).

## Writability is derived, not declared

A cell (board ∧ column ∧ swimlane filter, combined) is writable only if that combined filter is **invertible** — i.e. the engine can derive a unique mutation that would make an item satisfy it. `equals`, single-value `in`, `has`, `lacks`, `exists: false`, and `all` of invertible children are invertible. `any`, multi-value `in`, `exists: true`, comparators (`gt/gte/lt/lte`), and `matches` are NOT — any one of these anywhere in the combined filter makes the whole cell read-only (strict policy, no partial inverses). An axis's `writeOnDrop` can override this: give an explicit `Mutation[]` to run on drop instead of the derived one, or `{ readonly: true }` to force read-only regardless of filter. Details and worked derivation: [references/mutations-and-dnd.md](./references/mutations-and-dnd.md).

## Ordering

Per-cell order uses fractional-index string keys (base-62, lexicographically comparable) stored per-board on the item (`boards.$board.order`) or globally (`item.order`). Never renumber existing keys when inserting — generate a new key strictly between the two neighbors. See [references/order-keys.md](./references/order-keys.md) if you need to hand-author or debug an order key.

## Basic workflow

1. **New axis**: create `content/<slug>.md` with `entityType: axis`, a `filter` for membership, and `order`. Reuse an existing axis slug across boards instead of duplicating.
2. **New board**: create `content/<slug>.md` with `entityType: board`, optional candidate `filter`, then `columns`/`swimlanes` listing axis slugs (order in the array = display order).
3. **New item**: create `content/<slug>.md` with `entityType: item`, the properties your target axes filter on, and a `boards[]` entry naming the board(s) it should appear on (with an `order` key if you care about position).
4. To move an item, edit the property its target cell's filter checks (e.g. `status: doing`) rather than moving list positions manually — that's what a drag-and-drop write does under the hood.

## Gotchas

[references/gotchas.md](./references/gotchas.md) — notably: `boards[]` must stay an array (never let a mutation path create it as a keyed object), and `append`/`remove` mutation values must be string|number (never an object), so upserting a `boards[]` entry always goes through `set boards.<slug>.<field>`.

Running `provider-fs`/`sync-engine`/`kanban-ui` locally instead of authoring content? See the
silent-failure config traps first — none of these produce an error, they just make the board
look empty or wrong: [references/local-dev-config-traps.md](./references/local-dev-config-traps.md)
(provider defaults, Vite env loading, content-root/port mismatches) and
[references/coder-proxy-and-stale-processes.md](./references/coder-proxy-and-stale-processes.md)
(Coder subdomain proxying, orphaned dev processes squatting ports).

## provider-fs surface

Endpoint reference (list/render/homeless/CRUD): [references/provider-fs-api.md](./references/provider-fs-api.md).
