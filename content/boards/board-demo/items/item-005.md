---
id: item-005
boardId: board-demo
columnId: col-inprogress
swimlaneId: lane-bugfix
title: Item editor loses unsaved changes on route change
status: in_progress
priority: urgent
tags:
  - editor
  - ux
assignee: carol
createdAt: '2026-04-23T08:45:00.000Z'
updatedAt: '2026-04-26T10:30:00.000Z'
customFields:
  sprint: 3
---
## Description

Navigating away from a board while the item editor modal is open discards all unsaved edits with no warning.

## Expected

Show a confirmation dialog ("Discard changes?") before navigating away when the editor has dirty state.
