---
entityType: axis
slug: status-done
title: Done
description: >-
  Items where status is "done" or "complete". Uses an `any` (OR) filter so
  cells at this axis are always read-only — dropping here is disabled because
  the filter cannot be uniquely inverted.
filter:
  and:
    - property: status
      equals: done
    - property: status
      equals: complete
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-04T00:00:00.000Z'
---

This axis intentionally uses an `any` (OR) filter to demonstrate non-invertible
cells. Any board cell at the intersection of this axis and another axis is
**read-only** — drag-and-drop into it is rejected with a no-drop cursor.
