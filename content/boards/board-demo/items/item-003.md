---
id: item-003
boardId: board-demo
columnId: col-todo
swimlaneId: lane-bugfix
title: SSE reconnect drops pending events
status: todo
priority: high
tags:
  - sse
  - sync
createdAt: '2026-04-22T14:00:00.000Z'
updatedAt: '2026-04-22T14:00:00.000Z'
customFields:
  reportedBy: alice
---
## Description

When the browser reconnects after a network drop the SSE stream restarts but events fired during the gap are never replayed.

## Steps to Reproduce

1. Open the board
2. Kill the provider-fs sidecar for 5 seconds
3. Restart the sidecar and make a change via the API
4. Observe the UI does **not** reflect the change until hard-reload

## Expected

Missed events are replayed using `Last-Event-ID`.
