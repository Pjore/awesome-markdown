---
entityType: axis
slug: priority-high
title: High Priority
description: >-
  High-priority items. This axis is intentionally reused across boards:
  it appears as a column on board-dev and as a swimlane on board-all,
  demonstrating that the same axis slug can serve different dimensions
  on different boards.
filter:
  property: priority
  equals: high
order:
  by: boards.$board.order
  direction: asc
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-04T00:00:00.000Z'
---

Items with `priority: high`. This axis is reused as a **column** on `board-dev`
and as a **swimlane** on `board-all`.
