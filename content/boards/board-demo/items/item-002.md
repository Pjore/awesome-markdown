---
id: item-002
boardId: board-demo
columnId: col-todo
swimlaneId: lane-feature
title: Keyboard shortcut to create new card
status: todo
priority: low
tags:
  - accessibility
  - ux
createdAt: '2026-04-21T09:30:00.000Z'
updatedAt: '2026-04-27T09:21:05.939Z'
customFields:
  _order: 1000
---
## Description

Press `Ctrl+N` (or `⌘+N` on Mac) anywhere on the board to open the New Item dialog pre-filled with the current column context.

## Acceptance Criteria

- [ ] Shortcut works regardless of focus position
- [ ] Pre-fills column based on the last active cell
- [ ] Dismissible with Escape key
