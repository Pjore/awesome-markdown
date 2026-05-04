---
entityType: axis
slug: tag-urgent
title: Urgent
description: >-
  Items tagged as urgent. Has an explicit writeOnDrop override that appends
  the "urgent" tag AND sets priority to "high" — doing more than the filter
  alone would derive.
filter:
  property: tags
  has: urgent
writeOnDrop:
  - op: append
    path: tags
    value: urgent
  - op: set
    path: priority
    value: high
order:
  by: boards.$board.order
  direction: asc
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-04T00:00:00.000Z'
---

Items tagged `urgent`. Dropping an item onto this bucket appends the `urgent`
tag **and** explicitly sets `priority: high` via a `writeOnDrop` override —
demonstrating that an axis can prescribe more mutations than the filter alone
would derive.
