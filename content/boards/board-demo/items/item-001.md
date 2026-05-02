---
id: item-001
boardId: board-demo
columnId: col-inprogress
swimlaneId: lane-feature
title: Add dark mode toggle
status: todo
priority: medium
tags:
  - ui
  - settings
createdAt: '2026-04-20T10:00:00.000Z'
updatedAt: '2026-05-02T07:49:15.901Z'
customFields:
  _order: 1000
---
## Description

Add a dark mode toggle to the settings panel that respects the user's system preference and persists the choice.

## Acceptance Criteria

- [ ] Toggle in settings switches between light and dark theme
- [ ] Default respects `prefers-color-scheme` media query
- [ ] Choice persisted in localStorage
