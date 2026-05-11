# Implementation Plan: homeless-drag-drop

## 0. Metadata
- **Complexity:** 2
- **Uncertainty:** 1
- **Work:** 2
- **Scope:** Add drag-and-drop from the homeless panel into any board cell, materialising the cell's filter onto the item.
- **Non-goals:** No multi-select drag, no reordering within the homeless panel, no changes to `computeDropMutations`, `onDragEnd.ts`, or `mutateDragDrop.ts`. No backend/provider changes.

## 1. Problem Statement

Items listed in a board's `boards[]` whose frontmatter no longer matches any column filter appear in the `HomelessPanel` with no UI affordance to resolve them — the user must edit raw markdown. There is also no drag source/drop wiring between the panel and the board grid.

## 2. Constraints & Assumptions

- `DndContext` currently wraps only the board grid (`apps/kanban-ui/src/board/Board.tsx`); `HomelessPanel` is rendered outside it.
- The existing `ItemDragData` carries `columnSlug`/`swimlaneSlug`, which homeless items lack — a discriminated union variant is required.
- The "create item into cell" path in `apps/kanban-ui/src/board/Cell.tsx` already derives mutations via `deriveMutations(filter, { board: board.slug }, writeOnDrop)` — semantically identical to placing a homeless item.
- A homeless drop produces exactly one `PATCH /items/:slug` — the item already exists.
- Read-only cells (`cell.readOnly`) must reject homeless drops before any network call, matching existing behaviour.
- The `Item` shape returned in `Homeless.items` matches the shape rendered in cells — no extra refetch needed for the drag overlay.
- Optimistic state reuses the existing `optimisticCells` lifecycle; no parallel state slice.

## 3. Target State (Definition of Done)

**Functional:**
- A user can grab any item card in `HomelessPanel` and drop it on any cell container or on any item inside a cell.
- A successful drop fires one `PATCH /items/:slug` carrying the column ∧ swimlane filter mutations; the item disappears from the homeless panel and appears in the destination cell.
- Dropping on a read-only cell is a no-op (no network call, no optimistic state change).
- Dropping outside any valid target is a no-op; the item stays in the homeless panel.
- The drag overlay shows the homeless item's title while dragging, matching the existing item-drag visual.
- On `PATCH` failure, the item reappears in the homeless panel and the existing error toast is shown.

**Non-functional:**
- No regressions to existing cell→cell drag-drop, same-cell reorder, or read-only enforcement.
- No new state machine — homeless visibility is derived from `optimisticCells`.

**Success Criteria:**
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Existing unit tests pass; no test file is changed unless adding coverage.
- [ ] Manual verification via `agent-browser`: drag a homeless item into a column → frontmatter updates and item appears in the cell.
- [ ] Manual verification: drag onto a read-only cell → no change, no PATCH issued.

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `apps/kanban-ui/src/board/dnd/dragTypes.ts` | Modify | Add `HomelessItemDragData` variant; export a discriminated union of drag data types. |
| `apps/kanban-ui/src/board/HomelessItemCard.tsx` | New | Draggable card using `useDraggable` from `@dnd-kit/core`, carrying `HomelessItemDragData`. Visual parity with `ItemCard`. |
| `apps/kanban-ui/src/board/HomelessPanel.tsx` | Modify | Replace inline `<li>` rendering with `<HomelessItemCard>`. Accept an optional filter list so the parent can hide optimistically-moved items. |
| `apps/kanban-ui/src/board/Board.tsx` | Modify | Hoist `DndContext` to wrap the grid **and** the homeless panel; extend `handleDragEnd` with a homeless branch; extend `activeItem` lookup; derive filtered homeless list. |

## 5. Use Cases

### UC-1: Resolve a homeless item into a cell
**Actor:** User on the board view with one or more items in the homeless panel.
**Trigger:** User initiates a pointer drag on a homeless item card.

**Flow:**
1. User presses on a homeless item card; drag starts after the 4px activation distance.
2. The drag overlay renders the item title.
3. User moves the pointer over a target — either a cell container or another item inside a cell.
4. User releases the pointer.
5. System resolves the destination cell:
   - If `over.id` decodes via `decodeCellId` → that cell; `insertBeforeSlug = null`.
   - Else if `over.id` matches an item slug inside some cell → that cell; `insertBeforeSlug = over.id`.
   - Else → no-op.
6. If the destination cell is `readOnly` → no-op.
7. System derives mutations via `deriveMutations(filter, { board: board.slug }, writeOnDrop)` using the destination column and swimlane axes.
8. System applies optimistic state: adds the item to the destination cell at the requested position and stops rendering it in the homeless panel.
9. System issues `provider.patchItem(itemSlug, { mutations })`.
10. On success: optimistic state cleared; SSE refetch delivers the canonical render.
11. On failure: optimistic state cleared (item returns to the homeless panel); error toast shown.

**Input:** Active homeless item slug; drop target ID.
**Output:** One `PATCH /items/:slug` request and a corresponding visual move; or a no-op.
**Errors:** Network/PATCH failure → revert + toast. Read-only destination → silent no-op.

### UC-2: Cancel a homeless drag
**Actor:** User mid-drag.
**Trigger:** User releases outside any drop target, or presses Escape.

**Flow:**
1. `DndContext` fires `onDragCancel` or `onDragEnd` with no `over`.
2. `activeItemSlug` is cleared.
3. No mutations issued; homeless panel and grid remain unchanged.

**Input:** Cancel event.
**Output:** None.
**Errors:** None.

### Contracts

**Contract: homeless-item drag payload**
- **Provider:** `HomelessItemCard` (via `useDraggable({ data })`).
- **Consumer:** `Board.handleDragEnd`.
- **Shape:** `{ type: 'homeless-item'; itemSlug: string }`.

**Contract: drop-target ID space (unchanged)**
- **Provider:** `Cell` (cell container) and `ItemCard` (item slug).
- **Consumer:** `Board.handleDragEnd` for the homeless branch; reuses `decodeCellId` then falls back to cross-cell item-slug lookup.
- **Shape:** Either an encoded cell ID (`${columnSlug}::${swimlaneSlug}`) or an item slug.

**Contract: visible homeless list**
- **Provider:** `Board` (derives `homeless.items.filter(i => !slugsInOptimisticCells.has(i.slug))`).
- **Consumer:** `HomelessPanel` via a new `items` prop (overrides `homeless.items` for rendering).
- **Shape:** `Item[]`.

## 6. Execution Steps

1. **Drag payload union** — In `apps/kanban-ui/src/board/dnd/dragTypes.ts`, add `HomelessItemDragData { type: 'homeless-item'; itemSlug: string }` and export a `DragData = ItemDragData | HomelessItemDragData` union. Do not alter `ItemDragData` or the cell ID helpers.
2. **Homeless item card** — Create `apps/kanban-ui/src/board/HomelessItemCard.tsx`. Use `useDraggable({ id: item.slug, data: { type: 'homeless-item', itemSlug: item.slug } })`. Match the existing inline `<li>` visual style (mono/sans, border, padding). Preserve `data-testid="homeless-item-${slug}"` and `data-item-slug` attributes used by tests/automation.
3. **Homeless panel** — In `HomelessPanel.tsx`, accept an optional `items?: Item[]` prop that, when provided, overrides `homeless.items` for the rendered list. Replace the inline `<li>` with `<HomelessItemCard>`. Keep collapse behaviour; keep the count display sourced from the *visible* list. If the visible list is empty, render nothing.
4. **Board — hoist `DndContext`** — In `Board.tsx`, move the `DndContext` so it wraps both `<div className="flex-1 overflow-auto">` (the grid) and the `HomelessPanel`. Sensors, overlay, and existing handlers stay where they are inside the context.
5. **Board — extend `activeItem` lookup** — Fall back to `homeless?.items.find(i => i.slug === activeItemSlug)` when the cells lookup returns `undefined`, so the drag overlay renders during a homeless drag.
6. **Board — handle homeless drop** — In `handleDragEnd`, before delegating to `onDragEnd`, inspect `event.active.data.current`. If `type === 'homeless-item'`:
   - Resolve `dstColumnSlug`, `dstSwimlaneSlug`, `insertBeforeSlug` from `over.id` using `decodeCellId` then the cross-cell item-slug lookup (matching the existing logic in `onDragEnd.ts`).
   - Look up `dstCell`, `colAxis`, `slAxis`; bail on missing or `dstCell.readOnly`.
   - Build the combined filter (column ∧ swimlane ∧ board membership) the same way `Cell.tsx` does for create-into-cell, and call `deriveMutations(filter, { board: board.slug }, writeOnDrop)`.
   - Locate the moving item in `homeless.items`. Compute `newCells` by inserting it into `dstCell` at the requested position (no source-cell removal needed).
   - Set `optimisticCells`; call `provider.patchItem(itemSlug, { mutations })`; on success clear optimistic state, on failure clear and set the error toast — identical to the existing path.
7. **Board — derive visible homeless list** — Compute `const visibleHomelessItems = homeless ? homeless.items.filter(i => !optimisticCells || !optimisticCells.some(c => c.items.some(it => it.slug === i.slug))) : [];`. Pass this to `HomelessPanel` via the new `items` prop. Render the panel only when `visibleHomelessItems.length > 0`.
8. **No changes** to `onDragEnd.ts`, `mutateDragDrop.ts`, `Cell.tsx`, the filter engine, or any provider/backend code.

## 7. Validation & Verification

- Type and lint:
  - `pnpm --filter @awesome-markdown/kanban-ui typecheck`
  - `pnpm lint`
- Run existing tests: `pnpm test`.
- Manual via `agent-browser` against the running UI:
  1. Open a board with at least one homeless item (use existing fixture in `content/`).
  2. Drag a homeless item onto an empty cell → assert PATCH fires and item appears.
  3. Drag a homeless item onto a cell with existing items → assert insertion position.
  4. Drag a homeless item onto a read-only cell → assert no PATCH and no visual move.
  5. Drag a homeless item and drop outside any target → assert no change.
  6. Force a PATCH failure (e.g. by stopping `provider-fs`) → assert toast + item returns to panel.
- Regression: existing cell→cell drag still works; same-cell reorder still works.

## 8. Rollback Strategy

- Pure additive UI change in a single package. Revert the four touched files (`Board.tsx`, `HomelessPanel.tsx`, `dragTypes.ts`) and remove the new `HomelessItemCard.tsx`.
- No persisted/migrated state. No backend, contract, or filter-engine changes to undo.

## 9. Open Questions

- None blocking. Decisions doc (`ai-docs/homeless-drag-drop-decisions.md`) resolves all design questions.

## 10. References

- Decisions: [ai-docs/homeless-drag-drop-decisions.md](ai-docs/homeless-drag-drop-decisions.md)
- @dnd-kit `useDraggable`: https://docs.dndkit.com/api-documentation/draggable/usedraggable
- Existing create-into-cell mutation derivation: [apps/kanban-ui/src/board/Cell.tsx](apps/kanban-ui/src/board/Cell.tsx)
- Existing drop handler reference: [apps/kanban-ui/src/board/dnd/onDragEnd.ts](apps/kanban-ui/src/board/dnd/onDragEnd.ts)
