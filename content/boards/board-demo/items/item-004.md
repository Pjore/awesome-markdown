---
id: item-004
boardId: board-demo
columnId: col-inprogress
swimlaneId: lane-feature
title: Drag-and-drop swimlane reordering
status: in_progress
priority: medium
tags:
  - dnd
  - ui
assignee: bob
createdAt: '2026-04-18T11:00:00.000Z'
updatedAt: '2026-04-25T16:00:00.000Z'
customFields:
  sprint: 3
---
## Description

Allow users to reorder swimlanes by dragging them vertically, mirroring the existing column DnD behaviour.

## Progress

- [x] DnD context wired up for swimlanes
- [ ] Persist new order via `PUT /boards/:boardId/swimlanes/:swimlaneId`
- [ ] Optimistic update in UI state
