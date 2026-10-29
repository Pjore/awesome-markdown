---
name: awesome-markdown-usage
description: Author item, board and axis content; configure contextual filters, columns, repository rows and drag/drop behavior; explain board selection, recursive properties and homeless results.
---

# Kanban Content Authoring

Domain files in `content/` use `entityType: item | board | axis`. Shared schemas live in `packages/contracts/src/schemas/`. Boards select the item pool through filters and organize matches through referenced axes.

## Items and editing

Items have read-only root `entityType`, `slug`, `createdAt` and `updatedAt`. Other frontmatter properties are recursive text, finite numbers, booleans, null, mappings or mixed lists. A nonempty string `title` supplies the heading; otherwise `slug` is displayed. The API's root `body` contains Markdown document text.

The item page starts in read mode with document text beneath the heading, recursive properties and a metadata disclosure. Edit captures one property/document session; Save persists it atomically and returns to read mode. Cancel restores the entry snapshot. YAML recovery contains properties; Markdown recovery includes document text.

Bounds: 16 container levels, 5,000 values and 524,288 serialized UTF-8 bytes. Metadata and document text count toward bounds. Preserve literal keys, order, empty values, null and timestamp strings. [Authoring checklist](references/authoring-checklist.md).

## Board and axis definitions

Boards require `entityType`, `slug`, `title`, `createdAt`, `updatedAt`. `filter` selects candidates; `columns` and `swimlanes` are ordered axis-slug arrays. A filter is an object:

```yaml
filter:
  property: boards.$board.board
  equals: board-main
```

For several conditions use `all: [...]` or `any: [...]`. `$board` binds to the current board slug, which must match the intended comparison value. An omitted board filter selects the pool. Homeless results are board-filter candidates matching no column.

Axes require `entityType: axis`, `slug` and `title`. Their filters define grouping; `order` defines sorting; `writeOnDrop` defines explicit drop writes. One axis can be reused by several boards or dimensions.

Example item context:

```yaml
boards:
  - board: board-main
    column: todo
    order: aP
```

A column can filter `boards.$board.column`. A repository swimlane can filter root `repo`. `$axis` selects a group by its `axis` key and binds independently for each dimension. [Filter DSL](references/filter-dsl.md).

## Writes and sorting

Writable placement derives from the combined board/column/swimlane rules, with each axis's explicit override applied in its own context. One drop produces one atomic item update. Structural editor paths preserve literal keys and numeric indices; bound selectors retain `board`/`axis` identity. [Mutations and drag/drop](references/mutations-and-dnd.md).

Column ordering takes precedence over swimlane ordering, with `updatedAt` descending as fallback/tiebreak. Manual reordering uses a configured ascending string target and compatible fractional keys. [Order keys](references/order-keys.md).

## Workflows and providers

1. Define/reuse an axis for each desired grouping.
2. Reference its slug from the board's columns or swimlanes.
3. Set item properties matching the combined target rules.
4. Capture `{ item, revision }` before planned changes; send the exact revision with the mutation batch and verify the authoritative saved record.

[Provider API](references/provider-fs-api.md) · [Local development](references/local-development.md) · [Coder development](references/coder-development.md).

For a managed Home, use its declared board Extension. Inspect `home board board`/`axes`; `home board rows --repo REPO` adds repository swimlanes through the same configured service.
