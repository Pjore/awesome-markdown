---
entityType: item
slug: item-refactor-db
title: Refactor database connection pooling
boards:
  - board: board-dev
    order: c0
  - board: board-all
    order: VVVV
createdAt: '2026-05-04T00:00:00.000Z'
updatedAt: '2026-05-12T18:06:58.762Z'
project: dev
status: doing
priority: high
tags:
  - backend
dueDate: '2026-06-01'
---
Migrate from ad-hoc `pg.Pool` calls to a managed connection pool with proper
lifecycle hooks and graceful shutdown.

This item has `status: done`, placing it in the `status-done` swimlane on
`board-dev`. Because `status-done` uses a non-invertible `any` filter, any
cell at that swimlane row is **read-only** — drag-and-drop into those cells is
disabled.

It has a `boards[]` entry only for `board-dev` (not `board-all`), so on
`board-all` it appears without board-specific ordering.
