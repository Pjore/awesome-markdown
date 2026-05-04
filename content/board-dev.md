---
entityType: board
slug: board-dev
title: Dev Board
description: >-
  Development-project items only. B.filter scopes the candidate set to
  items where project = dev. Columns are priority-high (shared with
  board-all) and tag-urgent. Swimlanes cycle through the three status
  axes; the status-done swimlane is read-only because its filter uses
  an any (OR) operator.
filter:
  property: project
  equals: dev
columns:
  - priority-high
  - tag-urgent
swimlanes:
  - status-todo
  - status-doing
  - status-done
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-04T00:00:00.000Z'
---

Board scoped to `project: dev` items via a candidate-set filter.

- **Columns:** `priority-high` (reused axis, also a swimlane on `board-all`), `tag-urgent`
- **Swimlanes:** `status-todo`, `status-doing`, `status-done` (read-only — non-invertible `any` filter)

Any cell in the `status-done` swimlane is **read-only**.
