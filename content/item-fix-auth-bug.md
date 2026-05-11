---
entityType: item
slug: item-fix-auth-bug
title: Authentication bug in login flow!
boards:
  - board: board-dev
    order: VV
  - board: board-all
    order: '7'
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-11T08:40:53.265Z'
project: dev
status: doing
priority: high
tags:
  - urgent
  - backend
dueDate: '2026-05-10'
---
Investigate and fix the JWT validation error on the `/login` endpoint.

This item has `boards[]` entries for **both** `board-dev` and `board-all`,
exercising per-board `order` keys. It also carries the `urgent` tag, placing
it in the `tag-urgent` column on `board-dev`.

- On `board-dev`: column = `tag-urgent` (priority high + urgent tag), swimlane = `status-doing`
- On `board-all`: column = `status-doing`, swimlane = `priority-high`

/Per
