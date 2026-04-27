# Milestone Plan: M3 — kanban-ui MVP (board, columns, swimlanes, DnD)

## 0. Metadata
- **Milestone:** 3 of 10
- **Complexity:** 4
- **Uncertainty:** 3
- **Work:** 4
- **Estimated Files:** ~30 (app source + agent-browser scenarios + config)
- **Dependencies:**
  - M1 — `packages/contracts` (domain Zod schemas, `PersistenceProvider` interface, capabilities discriminator).
  - M2 — `packages/provider-localstorage` implementation of `PersistenceProvider`.
  - External: pnpm workspace already initialized, Tailwind v4, Vite 8, React 19, @dnd-kit, `agent-browser`.

## 1. Problem Statement
The repository has shared contracts and a working localStorage provider but no user-facing surface. Users cannot view, create, edit, delete, or rearrange items. M3 delivers the first observable UI: a Vite + React kanban app that binds to the localStorage provider and exposes a fully functional board with columns, swimlanes, and drag-and-drop. This milestone is the first to require `agent-browser` UI verification (per main plan §6a) and is the foundation every later UI milestone (M5, M8, M9) extends.

## 2. Constraints & Assumptions

**Hard constraints (from main plan):**
- Tech stack: Vite 8 (Rolldown + Oxc), React 19, Tailwind v4, @dnd-kit, TypeScript strict.
- File-size budget: ≤ 400 lines per `.ts` / `.tsx` file (AC-8).
- No `any`; all cross-package types come from `packages/contracts` (AC-7).
- UI must remain functional with no sidecar and no sync-engine running (AC-2, UC-5).
- No mobile-specific UX work (Non-Goal §2).
- UI verification is `agent-browser` only; no Vitest UI tests in this milestone (per §6a "Definition of verified working").

**Assumptions:**
- The `PersistenceProvider` interface from M1/M2 already exposes async CRUD for Items, Columns, Swimlanes, Boards plus `subscribe(handler) → Unsubscribe` and a `capabilities` discriminator. M3 consumes it as-is and does not extend it.
- Domain entity shapes (Item fields per content schema, Column ordering, Swimlane ordering) are fully defined in `packages/contracts`. M3 binds to those types verbatim.
- A single default board exists at first load. Multi-board navigation is M9, not M3.
- `agent-browser` is already installable as a dev dependency at the workspace root and is invocable via a Node CLI; this plan treats it as a black-box runner that loads scripted scenarios.
- Tailwind v4 is configured via the official Vite plugin (`@tailwindcss/vite`) using CSS-first config; no `tailwind.config.js` JS file is required unless tokens beyond defaults are needed.
- Item ordering inside a column is represented as an integer `order` (or equivalent) field already defined in contracts. If contracts represent ordering implicitly via array index, the provider call shape is whatever M2 already accepts.

**Out of scope:**
- Provider selection UI (M5/UC-6).
- HTTP/SSE provider client (M5).
- Conflict banner / resolution UI (M8).
- Multi-board list and `/boards/:slug` routing (M9).
- Item filtering, search, labels editor, attachments.
- Mobile / touch-specific drag affordances beyond what @dnd-kit ships by default.
- Theming, dark mode, i18n.
- Documentation (M10 owns README beyond a stub).

## 3. Target State (Definition of Done)

A green `pnpm --filter kanban-ui verify:m3` on a clean checkout indicates M3 is complete. Concretely:

- [ ] `apps/kanban-ui/` exists as a pnpm workspace member with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, and a `src/` tree.
- [ ] `pnpm --filter kanban-ui dev` serves the app; `pnpm --filter kanban-ui build` produces a Vite production bundle; `pnpm --filter kanban-ui typecheck` passes.
- [ ] App boots with the localStorage provider bound by default with **no** sidecar or sync-engine running (AC-2, UC-5).
- [ ] Board view renders columns horizontally and swimlanes as vertical row groupings (a column × swimlane grid of cells, each cell containing an ordered list of items).
- [ ] Item CRUD is reachable from the UI: a "create" affordance per cell, an edit dialog/inline editor exposing title, body, and every field defined by the content schema in `packages/contracts`, and a delete affordance per item.
- [ ] @dnd-kit drag-and-drop works for: moving an item between columns, moving an item between swimlanes (cross-cell drag), and reordering items within a column.
- [ ] Mutations call the provider; UI updates re-render via the provider's `subscribe` channel (no manual cache invalidation duplicated outside the subscription).
- [ ] No `.ts`/`.tsx` file exceeds 400 lines.
- [ ] No `any`, no untyped imports of provider or domain types; types come exclusively from `packages/contracts` (re-exported through `provider-localstorage` if needed).
- [ ] Layout is desktop-first responsive: usable at viewport widths ≥ 1024px; smaller widths may degrade but must not crash.
- [ ] `apps/kanban-ui/agent-browser/m3/` contains one scenario per UI behavior listed in §7.
- [ ] `pnpm --filter kanban-ui verify:m3` boots the dev server, runs every scenario in `agent-browser/m3/`, and exits 0.
- [ ] A stub `apps/kanban-ui/README.md` documents `dev`, `build`, `typecheck`, and `verify:m3` commands. (Full README content is owned by M10.)

## 4. Change Overview

| Path | Kind | Purpose |
|------|------|---------|
| `apps/kanban-ui/package.json` | create | Workspace package manifest; deps on `react`, `react-dom`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, workspace deps `@awesome-markdown/contracts`, `@awesome-markdown/provider-localstorage`; devDeps `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `typescript`, `agent-browser` (or root-level dev dep referenced). |
| `apps/kanban-ui/tsconfig.json` | create | Extends `tsconfig.base.json`; `strict: true`; `jsx: "react-jsx"`. |
| `apps/kanban-ui/vite.config.ts` | create | Registers `@vitejs/plugin-react` and `@tailwindcss/vite`. |
| `apps/kanban-ui/index.html` | create | Vite entry HTML; mounts `#root`. |
| `apps/kanban-ui/src/main.tsx` | create | App bootstrap; instantiates localStorage provider; renders `<App />` inside a `ProviderContext`. |
| `apps/kanban-ui/src/App.tsx` | create | Top-level layout; renders `<Board />`. |
| `apps/kanban-ui/src/styles.css` | create | Tailwind v4 `@import "tailwindcss";` entry. |
| `apps/kanban-ui/src/provider/ProviderContext.tsx` | create | React context wrapping a `PersistenceProvider`; exposes `useProvider()` hook. |
| `apps/kanban-ui/src/provider/defaultProvider.ts` | create | Factory that constructs the localStorage provider as the default binding. |
| `apps/kanban-ui/src/state/useBoardState.ts` | create | Hook that loads board data from the provider, subscribes to events, exposes `{ board, columns, swimlanes, items, status }`. |
| `apps/kanban-ui/src/state/useBoardMutations.ts` | create | Hook exposing CRUD + move/reorder calls bound to the active provider. |
| `apps/kanban-ui/src/board/Board.tsx` | create | Renders swimlane rows × column headers grid; wires the @dnd-kit `DndContext`. |
| `apps/kanban-ui/src/board/ColumnHeader.tsx` | create | Column title row. |
| `apps/kanban-ui/src/board/SwimlaneRow.tsx` | create | One swimlane: label + cells across all columns. |
| `apps/kanban-ui/src/board/Cell.tsx` | create | One column×swimlane cell; droppable; renders sortable items + "add item" affordance. |
| `apps/kanban-ui/src/board/ItemCard.tsx` | create | Draggable item card; title preview, click to open editor. |
| `apps/kanban-ui/src/board/ItemEditor.tsx` | create | Modal/inline editor for title, body, and every field from the content schema; save/delete actions. |
| `apps/kanban-ui/src/board/dnd/dragTypes.ts` | create | Type aliases / constants describing drag payload shape (which entity, source cell, source index). |
| `apps/kanban-ui/src/board/dnd/onDragEnd.ts` | create | Pure function that translates a @dnd-kit `DragEndEvent` into a provider mutation request (move-cross-column, move-cross-swimlane, reorder-within-column). |
| `apps/kanban-ui/src/lib/seed.ts` | create | Seeding helper used **only** by agent-browser scenarios via a query-flag entrypoint to deterministically seed localStorage with ≥2 columns, ≥2 swimlanes, ≥4 items. |
| `apps/kanban-ui/agent-browser/m3/render-board.scenario.ts` | create | Seed → load → assert grid renders. |
| `apps/kanban-ui/agent-browser/m3/create-item.scenario.ts` | create | Drive create UI; assert placement. |
| `apps/kanban-ui/agent-browser/m3/edit-item.scenario.ts` | create | Edit title + body; reload; assert persistence. |
| `apps/kanban-ui/agent-browser/m3/delete-item.scenario.ts` | create | Delete; assert removal. |
| `apps/kanban-ui/agent-browser/m3/dnd-across-columns.scenario.ts` | create | Drag across columns; assert column + order. |
| `apps/kanban-ui/agent-browser/m3/dnd-across-swimlanes.scenario.ts` | create | Drag across swimlanes; assert swimlane. |
| `apps/kanban-ui/agent-browser/m3/reorder-within-column.scenario.ts` | create | Reorder; reload; assert order. |
| `apps/kanban-ui/agent-browser/m3/runner.ts` | create | Entry that loads every `*.scenario.ts` and invokes `agent-browser` against a started dev server. |
| `apps/kanban-ui/README.md` | create (stub) | Minimum: dev / build / typecheck / verify:m3 commands. Full content deferred to M10. |
| `pnpm-workspace.yaml` | modify (if needed) | Ensure `apps/*` glob is present (likely already from M1). |

No source files outside `apps/kanban-ui/` are modified. `packages/contracts` and `packages/provider-localstorage` are consumed read-only.

## 5. Use Cases

**Implements UC-5** (User edits via kanban-ui with localStorage provider) — see main plan §5. M3 owns the entire UI surface for this use case: provider binding, CRUD affordances, DnD, and re-render on subscription events. UC-5 inputs/outputs are not redefined here; they are the contract from `packages/contracts`.

**UI surface obligation per main plan §6a coverage matrix:** "board renders; DnD across columns and swimlanes; CRUD via UI". Every row of that obligation maps 1:1 to a scenario in `apps/kanban-ui/agent-browser/m3/` (see §7).

**Layer responsibility for UC-5:**
- Translate user gestures (click, type, drag) into provider method calls.
- Re-render in response to `subscribe` events fired by the provider after each mutation.
- Persist nothing locally outside the provider; the provider owns localStorage.

**Interface notes (only if contracts are ambiguous — flag in §9):**
- M3 assumes the provider returns whole-board snapshots (`columns`, `swimlanes`, `items`) suitable for direct rendering. If contracts require N+1 fetches, M3's `useBoardState` will issue them but the provider call shape is unchanged.

## 6. Sub-tasks (ordered)

### Step 1: Scaffold the `kanban-ui` workspace package
**Objective:** Add `apps/kanban-ui/` as a buildable pnpm workspace member.

**Files:**
- `apps/kanban-ui/package.json` (create)
- `apps/kanban-ui/tsconfig.json` (create)
- `apps/kanban-ui/vite.config.ts` (create)
- `apps/kanban-ui/index.html` (create)
- `apps/kanban-ui/src/main.tsx` (create)
- `apps/kanban-ui/src/App.tsx` (create)
- `apps/kanban-ui/src/styles.css` (create)
- `apps/kanban-ui/README.md` (create stub)
- `pnpm-workspace.yaml` (verify glob covers `apps/*`)

**Actions:**
1. Create `package.json` declaring the package name, `type: "module"`, scripts `dev`, `build`, `preview`, `typecheck`, and a placeholder `verify:m3` script (filled in Step 8).
2. Add runtime dependencies on React 19, ReactDOM 19, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and workspace dependencies on `@awesome-markdown/contracts` and `@awesome-markdown/provider-localstorage`.
3. Add dev dependencies on Vite 8, `@vitejs/plugin-react`, `tailwindcss` v4, `@tailwindcss/vite`, and TypeScript.
4. Configure `tsconfig.json` to extend the root base config, enable `strict`, `noUncheckedIndexedAccess`, and React JSX transform.
5. Configure `vite.config.ts` to register the React plugin and the Tailwind v4 plugin.
6. Add `index.html` with a single `#root` mount and a script tag pointing at `src/main.tsx`.
7. Create empty shells for `main.tsx`, `App.tsx`, and `styles.css` (Tailwind CSS-first import).
8. Create the stub README listing the four commands.

**Rules:**
- Must not introduce a `tailwind.config.js`/`.ts` JS file unless extending the default token set is required by later steps.
- Must keep every file ≤ 400 lines.

**Output:** `pnpm --filter kanban-ui dev` boots a blank app; `pnpm --filter kanban-ui typecheck` passes.

---

### Step 2: Bind the localStorage provider via React context
**Objective:** Inject a `PersistenceProvider` instance into the React tree so every component reads the same provider.

**Files:**
- `apps/kanban-ui/src/provider/defaultProvider.ts` (create)
- `apps/kanban-ui/src/provider/ProviderContext.tsx` (create)
- `apps/kanban-ui/src/main.tsx` (update)

**Actions:**
1. Create `defaultProvider.ts` exporting a factory that constructs the localStorage provider from `@awesome-markdown/provider-localstorage` using whatever constructor signature M2 defined.
2. Create `ProviderContext.tsx` exposing a React context typed as the `PersistenceProvider` interface from `@awesome-markdown/contracts`, plus a `useProvider()` hook that throws if used outside the provider.
3. Update `main.tsx` to construct the default provider once and wrap `<App />` in the context.

**Rules:**
- Must not import provider implementation types directly from `provider-localstorage`; only the factory and the contract interface from `contracts`.
- Must keep the provider singleton stable across re-renders.

**Output:** `useProvider()` returns the bound localStorage provider anywhere inside `<App />`.

---

### Step 3: Build read-side state hooks
**Objective:** Load a board snapshot from the provider and re-render on subscription events.

**Files:**
- `apps/kanban-ui/src/state/useBoardState.ts` (create)

**Actions:**
1. Create a hook that, on mount, calls the provider to load the active board, its columns, swimlanes, and items.
2. Subscribe to provider events on mount and re-fetch (or merge) on event delivery.
3. Return a `{ status: 'loading' | 'ready' | 'error', board, columns, swimlanes, items }` shape.
4. Tear down the subscription on unmount via the `Unsubscribe` returned from `subscribe`.

**Rules:**
- Must not maintain a parallel cache that can drift from the provider's authoritative state.
- Must handle the empty-board case (no columns, no swimlanes, no items) without throwing.

**Output:** Components can consume board state with one hook call.

---

### Step 4: Build write-side mutation hooks
**Objective:** Centralize all CRUD + move/reorder calls so components never call the provider directly.

**Files:**
- `apps/kanban-ui/src/state/useBoardMutations.ts` (create)

**Actions:**
1. Expose async functions: `createItem(cell, partial)`, `updateItem(id, patch)`, `deleteItem(id)`, `moveItem(id, targetCell, targetIndex)`, `reorderItem(id, targetIndex)`.
2. Implement each by delegating to the provider methods defined in the M2 interface.
3. Forward provider errors unchanged.

**Rules:**
- Must not perform optimistic updates in M3 (subscription-driven re-render is the source of truth).
- Must accept and return only types from `packages/contracts`.

**Output:** A single hook every interactive component uses for writes.

---

### Step 5: Render the column × swimlane grid (no DnD yet)
**Objective:** Render a static board grid driven by `useBoardState`.

**Files:**
- `apps/kanban-ui/src/board/Board.tsx` (create)
- `apps/kanban-ui/src/board/ColumnHeader.tsx` (create)
- `apps/kanban-ui/src/board/SwimlaneRow.tsx` (create)
- `apps/kanban-ui/src/board/Cell.tsx` (create)
- `apps/kanban-ui/src/board/ItemCard.tsx` (create)
- `apps/kanban-ui/src/App.tsx` (update)

**Actions:**
1. Render a top row of `<ColumnHeader />` per column.
2. For each swimlane, render a `<SwimlaneRow />` that emits one `<Cell />` per column.
3. Each `<Cell />` lists `<ItemCard />` for items where `item.columnId` and `item.swimlaneId` match the cell.
4. `<ItemCard />` shows the item title (and a short body preview if defined in the schema).
5. Use Tailwind utility classes for layout; keep the grid horizontally scrollable when columns overflow viewport.
6. Mount `<Board />` in `<App />`.

**Rules:**
- Must render correctly with seeded localStorage state (verified by scenario 1 in §7).
- Must not rely on item ordering being injected from outside; sort items by the order field defined in contracts.
- Must keep desktop-first layout: usable at ≥ 1024px; degrade gracefully below.

**Output:** A read-only board view of seeded data.

---

### Step 6: Add item CRUD UI
**Objective:** Surface create, edit, and delete affordances and wire them to `useBoardMutations`.

**Files:**
- `apps/kanban-ui/src/board/Cell.tsx` (update)
- `apps/kanban-ui/src/board/ItemCard.tsx` (update)
- `apps/kanban-ui/src/board/ItemEditor.tsx` (create)

**Actions:**
1. Add an "add item" affordance to each `<Cell />` that opens `<ItemEditor />` in create mode for that cell.
2. Make `<ItemCard />` open `<ItemEditor />` in edit mode on click (or via an explicit edit button).
3. `<ItemEditor />` renders form controls for title, body, and every additional field defined by the content schema in `packages/contracts`. It exposes Save and Delete buttons.
4. Save calls `createItem` or `updateItem`; Delete calls `deleteItem`; close the editor on success and rely on the subscription to re-render.

**Rules:**
- Must derive the editor's field list from the content schema (single source of truth) — no hardcoded field names beyond what is unavoidable.
- Must validate input against the Zod schema from contracts before calling the provider; show inline validation feedback on failure.
- Must not block the UI thread during mutations; keep the editor disabled while a save is in flight.

**Output:** Users can create, edit, and delete items entirely through the UI.

---

### Step 7: Wire @dnd-kit drag-and-drop
**Objective:** Enable cross-column, cross-swimlane, and within-column drag interactions.

**Files:**
- `apps/kanban-ui/src/board/Board.tsx` (update)
- `apps/kanban-ui/src/board/Cell.tsx` (update)
- `apps/kanban-ui/src/board/ItemCard.tsx` (update)
- `apps/kanban-ui/src/board/dnd/dragTypes.ts` (create)
- `apps/kanban-ui/src/board/dnd/onDragEnd.ts` (create)

**Actions:**
1. Wrap `<Board />` in a @dnd-kit `DndContext` with appropriate sensors (Pointer, Keyboard).
2. Make each `<Cell />` a droppable target keyed by `(columnId, swimlaneId)`.
3. Make each `<ItemCard />` a sortable draggable inside its cell using `@dnd-kit/sortable`.
4. Define the drag payload shape in `dragTypes.ts`: `{ itemId, sourceColumnId, sourceSwimlaneId, sourceIndex }`.
5. Implement `onDragEnd` as a pure function returning a discriminated mutation request: `move` (cross-cell), `reorder` (within cell), or `noop`.
6. Have `<Board />` invoke `onDragEnd` and dispatch through `useBoardMutations`.

**Rules:**
- Must support keyboard drag (accessibility) using @dnd-kit's keyboard sensor defaults.
- Must not implement custom collision detection beyond @dnd-kit defaults unless seed scenarios require it.
- Drag drop logic file `onDragEnd.ts` must be a pure translator (no React, no provider calls) so it stays testable and small.

**Output:** Drag works across columns, across swimlanes, and within a column; persistence flows through the provider; UI re-renders via subscription.

---

### Step 8: Author agent-browser scenarios and the milestone verify command
**Objective:** Make `pnpm --filter kanban-ui verify:m3` exercise every UI behavior listed in §3.

**Files:**
- `apps/kanban-ui/src/lib/seed.ts` (create)
- `apps/kanban-ui/agent-browser/m3/render-board.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/create-item.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/edit-item.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/delete-item.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/dnd-across-columns.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/dnd-across-swimlanes.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/reorder-within-column.scenario.ts` (create)
- `apps/kanban-ui/agent-browser/m3/runner.ts` (create)
- `apps/kanban-ui/package.json` (update — fill `verify:m3`)

**Actions:**
1. Create `seed.ts` exposing a deterministic seed (≥ 2 columns, ≥ 2 swimlanes, ≥ 4 items). Trigger seeding from a dev-only URL flag (e.g. `?seed=m3`) so scenarios can request a known starting state.
2. Author one scenario per row in §7. Each scenario defines: required services (none beyond the dev server), the seed flag to apply, the user actions, and the DOM-level assertions.
3. Create `runner.ts` that starts (or attaches to) the dev server, iterates the scenario files, and runs each via `agent-browser`.
4. Fill the `verify:m3` script in `package.json` to invoke the runner.

**Rules:**
- Must verify persistence-across-reload scenarios (edit, reorder) by reloading the page inside the scenario, not by inspecting localStorage directly.
- Must not depend on any non-UI process (no sidecar, no sync-engine).
- Must exit non-zero on any failed assertion.

**Output:** `pnpm --filter kanban-ui verify:m3` runs all seven scenarios and reports pass/fail.

---

### Step 9: Final type, lint, and budget pass
**Objective:** Confirm acceptance constraints.

**Files:** none new.

**Actions:**
1. Run `pnpm typecheck` and `pnpm lint` at the root; fix violations inside `apps/kanban-ui/` only.
2. Confirm no `.ts`/`.tsx` file in `apps/kanban-ui/` exceeds 400 lines; if any does, split it along natural component or hook boundaries.
3. Confirm no `any` and no untyped imports of provider/domain types.

**Rules:** No source change outside `apps/kanban-ui/`.

**Output:** Repo passes `pnpm typecheck && pnpm lint` and M3 is ready for review.

## 7. Validation & Verification

**Milestone command:** `pnpm --filter kanban-ui verify:m3`. This is the single observable that gates M3 done.

**Agent-browser scenarios** (each lives in `apps/kanban-ui/agent-browser/m3/`):

| # | Scenario file | What it drives | Assertion |
|---|---------------|----------------|-----------|
| 1 | `render-board.scenario.ts` | Load page with `?seed=m3` → ≥ 2 columns, ≥ 2 swimlanes, ≥ 4 items pre-populated. | DOM shows the expected column headers, swimlane labels, and every seeded item in its correct cell. |
| 2 | `create-item.scenario.ts` | Click "add item" in a chosen cell, fill title/body, save. | New card appears in the chosen cell; total item count increases by 1. |
| 3 | `edit-item.scenario.ts` | Open an existing item, change title and body, save, reload page. | Updated title and body remain visible after reload (persistence via localStorage). |
| 4 | `delete-item.scenario.ts` | Open an item, press delete. | Card disappears; total item count decreases by 1. |
| 5 | `dnd-across-columns.scenario.ts` | Drag an item from column A to column B (same swimlane). | Card now lives in column B's cell at the expected index; column A no longer contains it. |
| 6 | `dnd-across-swimlanes.scenario.ts` | Drag an item from swimlane X to swimlane Y (same column). | Card now lives in swimlane Y's cell. |
| 7 | `reorder-within-column.scenario.ts` | Drag an item up within its cell, reload page. | Order is preserved across reload. |

**Out-of-band sanity checks** (manual or scripted, not gating):
- Dev tools console shows no React warnings on initial render or after each scenario.
- `pnpm --filter kanban-ui build` produces a bundle that boots via `pnpm --filter kanban-ui preview` and runs scenario 1 successfully.

**Non-UI checks (Vitest, etc.):** none in this milestone — UI verification is exclusively agent-browser per main plan §6a.

## 8. Rollback Strategy

- Greenfield app folder: rolling M3 back means deleting `apps/kanban-ui/` and reverting any `pnpm-workspace.yaml` change. No data migration is needed because the localStorage provider owns its own namespaced blob.
- If only DnD is unstable, Step 7 changes can be reverted independently — the board still renders read-only and CRUD continues to work without DnD.
- If only the agent-browser runner fails, scenarios can be run individually; the milestone is blocked but app code is salvageable.
- Provider contract is not changed by M3, so reverting M3 cannot break M2 or M1.

## 9. Open Questions

- **Default seed at first load:** Should an empty localStorage trigger a built-in default board (one column, one swimlane, no items) or render an empty-state CTA to create them? Plan currently assumes the empty-state CTA. Confirm with main-plan owner.
- **Item ordering representation:** Does the contract define ordering as an explicit `order: number` field, an array index inside the column, or a fractional/lex key? Step 5 and the `reorder` mutation depend on this. If ambiguous, M3 will need a small contract clarification (not a contract change).
- **Body field shape:** Is `body` plain text, markdown, or a structured node tree per the content schema? `<ItemEditor />` rendering depends on this. Plan currently assumes a multi-line plain-text textarea unless the schema declares richer shape.
- **Field set for `<ItemEditor />`:** The content schema in `packages/contracts` is the source of truth, but if it currently only specifies `title` and `body` then "every field per the content schema" reduces to those two. Confirm whether labels, due date, assignees, etc. are in scope for M3 or deferred.
- **`agent-browser` invocation contract:** Exact CLI / Node API shape to start the dev server, navigate to a URL, and assert on the DOM. Plan treats it as a black box; first scenario implementation must align with the actual agent-browser API.
- **Tailwind v4 plugin name:** `@tailwindcss/vite` is the current official plugin per Tailwind v4 docs; re-verify at implementation time in case of API drift.

## 10. References

- React 19 release notes — https://react.dev/blog/2024/12/05/react-19
- React 19 docs (hooks, context, JSX transform) — https://react.dev/reference/react
- Vite 8 guide — https://vite.dev/guide/
- Vite 8 migration guide — https://vite.dev/guide/migration
- `@vitejs/plugin-react` — https://github.com/vitejs/vite-plugin-react
- Tailwind v4 install (Vite) — https://tailwindcss.com/docs/installation/using-vite
- `@tailwindcss/vite` plugin — https://tailwindcss.com/docs/installation/framework-guides/vite
- @dnd-kit overview — https://docs.dndkit.com/
- @dnd-kit `DndContext` — https://docs.dndkit.com/api-documentation/context-provider
- @dnd-kit sortable preset — https://docs.dndkit.com/presets/sortable
- @dnd-kit sensors (pointer, keyboard) — https://docs.dndkit.com/api-documentation/sensors
- pnpm workspaces — https://pnpm.io/workspaces
- Zod v4 — https://zod.dev/
- Main plan — `ai-docs/awesome-markdown-main.md` (UC-5 §5; UI verification §6a; AC-2/7/8/9 §6)
