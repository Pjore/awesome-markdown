---
entityType: board
slug: board-all
title: All Items Board
description: >-
  Shows all items with no candidate-set filter. Columns are the three
  status axes; the status-done column is read-only (non-invertible any
  filter). Swimlane is priority-high, which is reused as a column on
  board-dev.
columns:
  - status-todo
  - status-doing
  - status-done
swimlanes:
  - all
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-04T00:00:00.000Z'
---

Board without a candidate-set filter — all items are eligible.

- **Columns:** `status-todo`, `status-doing`, `status-done` (read-only — non-invertible `any` filter)
- **Swimlanes:** `priority-high` (reused axis, also a column on `board-dev`)

The `status-done` column is always **read-only** because its axis uses an
`any` OR filter that cannot be inverted to derive a unique mutation.
