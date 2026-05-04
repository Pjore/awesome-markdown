# Milestone 4: Drag-and-drop visual language

## Metadata
- Parent plan: [ai-docs/ui-redesign-main.md](ai-docs/ui-redesign-main.md)
- Complexity: 3 / Work: 2
- Depends on: M1 (tokens), M3 (board surface ships current Cell/ItemCard markup and any `data-*` drop hooks). M4 may add hooks if M3 didn't land them.
- Use cases: UC-4

## Objective
Replace every existing drop-target / drag visual on the board with the four states fixed in [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md) Q10. Logic — drop validity, mutation derivation, sortable wiring — is unchanged. Only the rendered styling and the markup hooks needed to bind that styling change.

## The four states (authoritative)

| # | Trigger | Hook to bind | Visual |
|---|---------|--------------|--------|
| 1 | Card is being dragged (source) | `data-dragging="true"` on `[data-testid^="item-card-"]` (set from `useSortable().isDragging`) | `opacity: 0.4`; no shadow; no scale; no transform other than `@dnd-kit` translation |
| 2 | Pointer over a cell whose combined filter is invertible | `data-drop-state="valid"` on `[data-testid^="cell-"]` (set when `isOver && !cell.readOnly`) | `border: 1.5px solid var(--accent)` |
| 3 | Pointer over a cell whose combined filter is non-invertible | `data-drop-state="invalid"` on `[data-testid^="cell-"]` (set when `isOver && cell.readOnly`) | `border: 1px dashed var(--ink-muted)`; `cursor: not-allowed` |
| 4 | Pointer between two cards inside a state-2 cell | `data-drop-insertion="before"` on the `[data-testid^="item-card-"]` whose top edge is the prospective insertion line | `::before` pseudo-element: 2px solid `var(--accent)` horizontal rule, full card width, sitting flush above the card |

State 2 and 3 are mutually exclusive on a given cell. State 4 only exists inside a state-2 cell. State 1 stacks with any cell state.

`cell.readOnly` already comes from the filter-engine render result and is the canonical invertibility flag for the cell — see existing usage in [apps/kanban-ui/src/board/Cell.tsx](apps/kanban-ui/src/board/Cell.tsx). Do not re-derive it.

## Scope
**In:**
- Cell drop-target visual feedback in [apps/kanban-ui/src/board/Cell.tsx](apps/kanban-ui/src/board/Cell.tsx).
- Card dragging visual feedback in [apps/kanban-ui/src/board/ItemCard.tsx](apps/kanban-ui/src/board/ItemCard.tsx).
- Insertion placeholder rendering on cards (state 4).
- Token-driven CSS for the four states in [apps/kanban-ui/src/styles.css](apps/kanban-ui/src/styles.css) (or a small co-located CSS module if the M1/M3 convention is per-component).
- Updates to verify:ui scenarios that exercise drag interactions.

**Out:**
- Anything in [apps/kanban-ui/src/board/dnd/](apps/kanban-ui/src/board/dnd/) — `dragTypes.ts`, `mutateDragDrop.ts`, `onDragEnd.ts` are pure logic, must not change. (Inspect confirmed: that directory contains zero visual code today.)
- Filter-engine, invertibility analysis, mutation derivation.
- Conflict-locked card styling (existing `data-conflict` lock indicator) — leave alone.
- Any motion, transition, animation, scale, or shadow.

## Constraints
- The four states are the **only** drop-related visuals on the board. Anything else found during the cleanup sweep must be deleted.
- All four state styles must use only the design tokens `--accent`, `--ink-muted`, `--border`, `--bg`. No literal hex values, no chromatic colors.
- No Tailwind utility classes anywhere in the touched files. M1 removed Tailwind; any class strings still present in `Cell.tsx` / `ItemCard.tsx` are pre-redesign legacy and must go.
- `data-testid` values listed in the table above are preserved verbatim; new hooks are additive `data-*` attributes only.
- Zero `border-radius`, zero `box-shadow`, zero `transform: scale(...)` on any of these states.

## Cleanup sweep (no legacy)
Search and delete in this milestone:
- In `Cell.tsx`: the `dropHighlight` branch, `bg-blue-50`, `border-blue-300`, `bg-white`, `transition-colors`, the entire Tailwind `className` array, and the `+ Add item` styling string (replace with token-driven minimal styling consistent with M3 — but do not redesign the affordance here; keep its existing structure, just strip Tailwind).
- In `ItemCard.tsx`: `bg-white`, `border rounded shadow-sm`, `border-amber-300`, `cursor-not-allowed opacity-70` (the conflict variant keeps the *behavior* but expressed via tokens / existing M3 styling, not Tailwind), `cursor-grab active:cursor-grabbing`. The `style={{ opacity: isDragging ? 0.4 : 1 }}` inline style is replaced by the `data-dragging` hook + CSS.
- Grep [apps/kanban-ui/src/board/](apps/kanban-ui/src/board/) for `bg-blue`, `ring-`, `shadow`, `scale-`, `hover:bg-`, `transition` — every hit on a drag/drop-related element is removed.
- Confirm [apps/kanban-ui/src/board/SwimlaneRow.tsx](apps/kanban-ui/src/board/SwimlaneRow.tsx) carries no drop-target styling; if it does, delete it (drop styling lives on cells, not rows).

If the cleanup uncovers a drop-related visual not enumerated in the four states, delete it. Do not preserve it "just in case".

## File-level changes (outcome-level)

| File | Change | What it does after |
|------|--------|--------------------|
| [apps/kanban-ui/src/board/Cell.tsx](apps/kanban-ui/src/board/Cell.tsx) | Modify | Sets `data-drop-state="valid" \| "invalid"` (or omitted) based on `isOver` + `cell.readOnly`. No Tailwind classes. No `dropHighlight` branch. Existing `data-readonly`, `data-column-slug`, `data-swimlane-slug`, `data-testid` preserved. |
| [apps/kanban-ui/src/board/ItemCard.tsx](apps/kanban-ui/src/board/ItemCard.tsx) | Modify | Sets `data-dragging="true"` from `useSortable().isDragging`. Sets `data-drop-insertion="before"` when this card is the sortable `over` target during an active drag inside a non-readonly cell (consume `useSortable`'s `isOver` + `active`/`over` from `useDndContext`). Renders the 2 px placeholder via CSS `::before` keyed on that attribute. Removes the inline `opacity` style and Tailwind classes. |
| [apps/kanban-ui/src/styles.css](apps/kanban-ui/src/styles.css) (or M3-established equivalent) | Modify | Add CSS rules for the four `data-*` selectors above, using only design tokens. Remove any prior drop-state CSS introduced in M3 that conflicts. |
| [apps/kanban-ui/src/board/dnd/](apps/kanban-ui/src/board/dnd/) | No change | Verified pure logic — leave untouched. |

The `data-drop-insertion` decision (only renders inside a valid cell) requires reading the active drag's source/target cell. `useDndContext` exposes `active` and `over`; the cell-validity check reuses `cell.readOnly` of the cell that contains the `over` item. Implement this as the smallest read necessary; do not refactor the drag pipeline.

## Definition of Done
- [ ] All four states render exactly as specified, sourced only from design tokens.
- [ ] No element on the board carries any drop-related background fill, ring, shadow, scale, hover-color-shift, or transition.
- [ ] `Cell.tsx`, `ItemCard.tsx`, `SwimlaneRow.tsx`, and [apps/kanban-ui/src/board/dnd/](apps/kanban-ui/src/board/dnd/) are Tailwind-free; `grep -E 'bg-|ring-|shadow|scale-|hover:|transition' apps/kanban-ui/src/board` returns no hits on dnd-related elements.
- [ ] `apps/kanban-ui/src/board/dnd/` files are byte-identical to their pre-M4 state.
- [ ] verify:ui scenarios under [apps/kanban-ui/agent-browser/m3/](apps/kanban-ui/agent-browser/m3/) that drive drags (`dnd-across-columns`, `dnd-across-swimlanes`, `reorder-within-column`) updated to assert: `data-dragging="true"` on the source card mid-drag; `data-drop-state="valid"` on a valid hover target; `data-drop-state="invalid"` on a read-only hover target; `data-drop-insertion="before"` on the card above which insertion would occur. Add a screenshot assertion for at least one valid and one invalid hover frame.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm verify:ui` all green.
- [ ] Existing drop behavior unchanged: same items get written, same files, same conflict path.

## Risks & Decisions To Get Right
- **Don't reintroduce hover/transition affordances.** The decisions doc is explicit: state-based, not motion-based. If a state feels "abrupt" without animation, that is the intended feel.
- **Insertion placeholder must not jiggle layout.** Implement as `::before` with absolute positioning or as a 2 px element that replaces existing top-margin space, so cards don't shift when it appears.
- **Read-only cells must not show state 4.** The placeholder lives only inside state-2 cells; gate the `data-drop-insertion` write accordingly.
- **`data-conflict` (existing) is orthogonal.** Conflict-locked cards keep their existing lock indicator and disabled-drag behavior; they simply never enter state 1 because `useSortable` is `disabled`.

## Open Questions
- None. The four states, hooks, and tokens are fully specified by Q10 and the existing render contract.
