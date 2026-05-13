---
name: kanban-content
description: How awesome-markdown kanban content files work — items, boards, axes, filters, order, and the homeless view. Load when reading or writing files in content/.
---

# Kanban Content

All kanban data lives as `.md` files in `content/`. Every file has a YAML frontmatter block with `entityType: item | board | axis`. The markdown body is free text; all structured data is in frontmatter.

---

## Items (`entityType: item`)

A kanban card. All fields live in frontmatter.

Required: `entityType`, `slug`, `title`  
Common: `status`, `priority`, `tags`, and any custom properties

The `boards` array registers the item with one or more boards. Each entry has:
- `board` — slug of the board
- `order` — fractional-index string for sort position **within that board** (independent per board)

```yaml
entityType: item
slug: item-fix-auth
title: Fix auth bug
status: doing
priority: high
tags: [urgent, backend]
boards:
  - board: board-dev
    order: c0V
  - board: board-all
    order: '7'
```

---

## Boards (`entityType: board`)

A query over the item pool — not a container. Items are not owned by boards.

- `filter` (optional): scopes the candidate set to matching items
- `columns`: ordered list of axis slugs rendered as columns
- `swimlanes`: ordered list of axis slugs rendered as swimlane rows

```yaml
entityType: board
slug: board-dev
filter:
  property: project
  equals: dev
columns: [priority-high, tag-urgent]
swimlanes: [status-todo, status-doing, status-done]
```

---

## Axes (`entityType: axis`)

A reusable column or swimlane definition. The same axis slug can be a column on one board and a swimlane on another.

- `filter`: which items belong in this cell
- `order`: how items sort within the cell

```yaml
entityType: axis
slug: status-todo
filter:
  property: status
  equals: todo
order:
  by: boards.$board.order
  direction: asc
```

---

## Filters

| Operator | Invertible? | Effect on drop |
|---|---|---|
| `equals` | ✅ Yes | Writes the matched field to the item file |
| `any` / `or` | ❌ No | Cell is read-only; drag-and-drop is disabled |

**Invertible** means the UI can derive the exact field mutation required to move a card into that cell.

---

## Order

`order.by: boards.$board.order` sorts items by the fractional-index string stored in each item's `boards[]` entry for the active board. This allows the same item to have independent positions on different boards.

Reordering a card updates only the `order` value in that one `boards[]` entry — no other fields change.

---

## Homeless view

An item is registered to a board by having a matching entry in its `boards[]` array. If the item matches the board's candidate-set filter but matches **no column cell**, it appears in the board's `/homeless` view instead of the main grid. It is not lost.

To move a homeless item onto the board, drag it into any writable column cell — this writes the axis filter's `equals` field to the item.
