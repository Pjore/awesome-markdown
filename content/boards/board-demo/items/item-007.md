---
id: item-007
boardId: board-demo
columnId: col-done
swimlaneId: lane-bugfix
title: CORS headers missing on SSE endpoint
status: done
priority: high
tags:
  - sse
  - cors
createdAt: '2026-04-24T12:00:00.000Z'
updatedAt: '2026-04-27T08:00:00.000Z'
customFields:
  fixedIn: fix/sse-cors-xdg-crash
---
## Description

The SSE `GET /boards/:boardId/subscribe` endpoint did not set `Access-Control-Allow-Origin` on the hijacked connection, causing browsers to block the event stream when the UI and sidecar run on different ports.

## Fix

Set CORS headers before calling `raw.flushHeaders()` in the SSE plugin.
