# Homeless Item Drag-and-Drop — Design Decisions

## Context

The homeless panel shows items that belong to a board (listed in the item's `boards[]` array) but match no column filter. Currently there is no UI action to resolve a homeless item — the user cannot move it into a cell without editing the raw markdown. This feature adds drag-and-drop from the homeless panel into any board cell.

## Use Cases

- An item's frontmatter has drifted out of sync with the board's column filter definitions. Drag it into the correct column to fix the field values in one gesture.
- A new item was created outside the board context (e.g. via the item editor) without the correct column field set. Drag it into the right cell to assign it.
- Multiple homeless items exist — each can be dragged individually into whichever cell is appropriate.

---

## Decisions

### 1. DndContext scope — hoist to wrap the full Board layout

**Decision:** Move `DndContext` up to wrap both the scrollable board grid and the `HomelessPanel`. Currently `HomelessPanel` is rendered outside the `DndContext`, so draggables inside it have no access to the board's drop targets.

**Rationale:** A single context keeps all drop logic in one place. A second nested context would require custom coordination between contexts and is a known complexity trap with @dnd-kit.

---

### 2. Drag data type — new `HomelessItemDragData` discriminated union variant

**Decision:** Add `HomelessItemDragData { type: 'homeless-item'; itemSlug: string }` to `dragTypes.ts`. The existing `ItemDragData` requires `columnSlug` and `swimlaneSlug` which homeless items do not have.

**Rationale:** A discriminated union keeps the two drag origins semantically distinct. `Board.tsx`'s `handleDragEnd` checks the type first and branches accordingly. The existing `'item'` path is untouched.

---

### 3. Mutation derivation — reuse the "create item into cell" path, not computeDropMutations

**Decision:** Homeless drops bypass `computeDropMutations` entirely. In `Board.tsx`, after detecting `type: 'homeless-item'`, derive mutations with `deriveMutations(filter, { board: board.slug }, writeOnDrop)` directly — the same call `Cell.tsx` makes when creating a new item into a cell. Then call `provider.patchItem` (item already exists, so PATCH not POST).

**Rationale:** A homeless item has no source cell, so there are no src-side mutations to undo. The mutation derivation is semantically identical to "place an item into this cell for the first time." Reusing the existing path avoids touching `computeDropMutations`, requires no new function signatures, and no new flags or variants.

---

### 4. Draggable hook — `useDraggable` (not `useSortable`) in a new `HomelessItemCard`

**Decision:** Create a new `HomelessItemCard` component that uses `useDraggable` from `@dnd-kit/core`. The homeless panel is a drag *source* only — there is no in-panel reordering.

**Rationale:** `useSortable` wraps `useDraggable` + `useDroppable` and requires a `SortableContext` parent. Adding that plumbing to a list with no sort behaviour is misleading and unnecessarily complex. `useDraggable` is the correct primitive.

---

### 5. Drop targets — both cell containers and item slugs

**Decision:** In the homeless drop handler in `Board.tsx`, decode `over.id` as either a cell container ID (`col::sl` format via `decodeCellId`) or an item slug. If it's an item slug, find the owning cell and set `insertBeforeSlug` accordingly. Matches the exact behaviour of `onDragEnd.ts` for regular item drags.

**Rationale:** Cell container drop zones are narrow when a cell is full of cards. Without item-over support the user would have to aim for empty space below all cards, making the interaction unreliable. The lookup is a simple `cells.flatMap(c => c.items).find(i => i.slug === overId)`.

---

### 6. DragOverlay — extend activeItem lookup to include homeless items

**Decision:** The `activeItem` lookup in `Board.tsx` currently searches `cells.flatMap(c => c.items)`. Extend it with a fallback: `?? homeless?.items.find(i => i.slug === activeItemSlug)`.

**Rationale:** Without this, the drag overlay shows nothing while a homeless item is being dragged. A one-line fallback restores the ghost card during the drag gesture.

---

### 7. Optimistic homeless state — derived, not new state

**Decision:** Do not add a separate `optimisticHomelessItems` state slice. Instead, derive the visible homeless list inline: filter `homeless.items` to exclude any item slug that already appears in `optimisticCells`. When `optimisticCells` is set (item placed into a cell), the homeless panel hides that item automatically. When `optimisticCells` is cleared (on success or failure), the item reappears until the SSE refetch settles.

**Rationale:** Derived state requires no new revert logic and stays consistent by construction. It reuses the existing `optimisticCells` lifecycle rather than introducing a parallel state machine.

---

## Files Affected

| File | Change |
|------|--------|
| `apps/kanban-ui/src/board/dnd/dragTypes.ts` | Add `HomelessItemDragData` type and union |
| `apps/kanban-ui/src/board/HomelessPanel.tsx` | Replace `<li>` with `<HomelessItemCard>` |
| `apps/kanban-ui/src/board/HomelessItemCard.tsx` | New component — `useDraggable`, visual style matching `ItemCard` |
| `apps/kanban-ui/src/board/Board.tsx` | Hoist `DndContext`, extend overlay lookup, add homeless drop branch in `handleDragEnd`, derive filtered homeless list |
| `onDragEnd.ts`, `mutateDragDrop.ts` | No changes |
