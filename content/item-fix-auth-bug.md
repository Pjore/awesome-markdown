---
entityType: item
slug: item-fix-auth-bug
title: Fix authentication bug in login flow
project: dev
status: doing
priority: high
tags:
  - urgent
  - backend
dueDate: '2026-05-10'
boards:
  - board: board-dev
    order: a0
  - board: board-all
    order: b0
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-04T00:00:00.000Z'
---

Investigate and fix the JWT validation error on the `/login` endpoint.

This item has `boards[]` entries for **both** `board-dev` and `board-all`,
exercising per-board `order` keys. It also carries the `urgent` tag, placing
it in the `tag-urgent` column on `board-dev`.

- On `board-dev`: column = `tag-urgent` (priority high + urgent tag), swimlane = `status-doing`
- On `board-all`: column = `status-doing`, swimlane = `priority-high`
