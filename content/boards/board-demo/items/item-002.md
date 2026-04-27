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
updatedAt: '2026-04-21T09:30:00.000Z'
customFields: {}
---
## Description

Allow users to press `n` (or `c`) on a focused column to open the new-card dialog without reaching for the mouse.

## Notes

- Scope shortcut to the board view only (not inside input fields)
- Follow existing shortcut pattern used by `@dnd-kit` event listeners
