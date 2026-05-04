# Milestone 5: Full-page item editor route

## Metadata
- Parent plan: [ai-docs/ui-redesign-main.md](ai-docs/ui-redesign-main.md)
- Complexity: 3 | Work: 3
- Depends on: M1 (tokens, fonts, theme), M2 (TopBar + Breadcrumb context), M3 (ItemCard layout)
- Use cases: UC-5

## Objective
Introduce `/items/:slug` as the canonical, full-page item editor for title and body; route the existing item-card click into it; remove the legacy inline `ItemEditor` stub and any vestigial inline-editor wiring.

## Scope

**In:**
- New page `apps/kanban-ui/src/pages/ItemEditorPage.tsx` mounted at `/items/:slug` in `App.tsx`.
- `ItemCard` becomes clickable: `onClick` navigates with `useNavigate('/items/<slug>', { state: { from: '/boards/<boardSlug>' } })`. Click must not fire while a drag is in progress, and must not fire when the card is conflict-locked.
- Breadcrumb context (introduced in M2) is extended to carry an optional item segment so the bar can render `boards / <board-slug> → items / <item-slug>` while the editor is mounted. The page sets the segment on mount and clears it on unmount.
- Save uses the existing provider path: `provider.patchItem(slug, { mutations: [...] })` from `apps/kanban-ui/src/provider/ProviderContext`. Title and body each map to a single `set` mutation; only fields actually changed by the user are sent. One save = one PATCH = one file write.
- Cancel and browser back both return to the originating board (`location.state.from`); fallback `/` if state is absent.
- Save failure surfaces inline beneath the actions area using the existing conflict/error surfacing path already used by drop mutations in `Board.tsx` (subscribe to the same store; do not invent a new one).
- Loading and not-found states for the initial `provider.getItem(slug)` call.

**Out:**
- No new fields beyond `title` and `body` (tags, priority, frontmatter passthroughs are read-only here).
- No autosave, no dirty-tracking persistence across reload, no keyboard shortcut surface beyond focus order.
- No changes to `provider.ts` contract, `PatchItemRequest`, or any package outside `apps/kanban-ui/`.
- No item creation flow change (Cell.tsx inline-create stays).
- No styling beyond what tokens from M1 already provide.

## Constraints
- Typography per [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md) Q11: large mono slug label as page heading; Inter Tight title input (large, hairline border, transparent fill, zero radius); JetBrains Mono body textarea (full width, generous height, hairline border, transparent fill); save and cancel are text-only mono buttons; focus-visible yellow ring on every interactive element.
- All styling via design tokens from `styles.css` — no Tailwind utility classes anywhere in new or touched files.
- All local imports use `.js` extension.
- File length ≤ 400 lines per source file.
- No new state library; co-located component state is sufficient.

## Contracts
- **Breadcrumb item segment:** the M2 `BreadcrumbContext` exposes a setter that takes an optional `{ slug: string }`; consumed by `Breadcrumb.tsx` to render the trailing `→ items / <slug>` segment when present. If M2 shipped a route-derived breadcrumb instead of a context, this milestone adds the minimum context surface needed and updates `Breadcrumb.tsx` to consume it.
- **Navigation state:** `ItemCard` → `ItemEditorPage` carries `state: { from: string }` where `from` is the current board path. `ItemEditorPage` reads it via `useLocation` for back-navigation.

## Changes

**Create:**
- `apps/kanban-ui/src/pages/ItemEditorPage.tsx` — route component: fetch item, render heading + title input + body textarea + save/cancel, wire navigation and error surfacing.

**Modify:**
- `apps/kanban-ui/src/App.tsx` — register `<Route path="/items/:slug" element={<ItemEditorPage />} />`.
- `apps/kanban-ui/src/board/ItemCard.tsx` — add click → navigate; ensure click is suppressed during drag and when conflict-locked; add `data-testid` for the click target if not already present.
- `apps/kanban-ui/src/app-shell/Breadcrumb.tsx` (and the M2 breadcrumb context module, whichever name M2 chose) — extend to render the optional item segment.

**Removals (audit list — no legacy survives this milestone):**
- `apps/kanban-ui/src/board/ItemEditor.tsx` — currently a deprecated `export {}` stub; delete the file.
- Delete `apps/kanban-ui/src/state/useBoardMutations.ts` if no consumers remain after M3/M4 (it is already a deprecated empty type stub); confirm via grep before deleting.
- Any import of `ItemEditor` from anywhere in `apps/kanban-ui/src/` — none expected, but grep `ItemEditor`, `editingItem`, `editorOpen`, `openEditor`, `setEditor` across the app and remove every match.
- Any modal/inline editor markup, container `<dialog>`/portal, or overlay state in `Board.tsx`, `Cell.tsx`, or `BoardPage.tsx` — none expected from current code, but verify and remove if found.

If the grep audit returns zero matches for the legacy symbols, record that fact in the PR description; do not invent removals.

## Definition of Done
- [ ] Visiting `/items/<existing-slug>` renders the editor with current title and body populated; visiting an unknown slug renders a not-found state styled with M1 tokens.
- [ ] Clicking an item card on a board navigates to `/items/<slug>` and the breadcrumb shows `boards / <board-slug> → items / <item-slug>`.
- [ ] Editing title and/or body and clicking save issues exactly one `provider.patchItem` call containing only the fields that changed; on success, navigation returns to the originating board and the board reflects the change.
- [ ] Save failure renders an inline error in the editor and leaves the form values intact; the page does not navigate away.
- [ ] Cancel button and browser back both return to the originating board path; if `location.state.from` is missing, both go to `/`.
- [ ] Drag interactions on `ItemCard` still work; clicking does not trigger during a drag; conflict-locked cards do not navigate.
- [ ] Grep for `ItemEditor`, `editingItem`, `editorOpen`, `openEditor`, `setEditor` across `apps/kanban-ui/src/` returns no matches.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm verify:ui` all pass.

## verify:ui spec updates
Live under `apps/kanban-ui/agent-browser/m5/`:
- New scenario: open a board, click an item card, assert URL is `/items/<slug>`, assert breadcrumb path text, edit title, click save, assert URL is back on the board and the card shows the new title.
- New scenario: navigate to editor, click cancel, assert URL is back on the originating board with no write.
- New scenario: navigate directly to `/items/<slug>` (no `state.from`), click cancel, assert URL is `/`.
- Audit existing M3/M4 scenarios for any selector that opened or asserted an inline editor; if found, replace with a navigation assertion. (None expected given current code.)

## Risks & Decisions To Get Right
- **Click vs drag on `ItemCard`:** use a small movement threshold or `@dnd-kit`'s drag-active flag to guard the click; do not bind the click handler on the drag listener target without suppression.
- **Patch shape:** send only changed fields. Title unchanged + body changed = a single-mutation array. Do not send empty mutation arrays; if nothing changed, save is a no-op that just navigates back.
- **Breadcrumb segment lifecycle:** clear on unmount so navigating away from the editor does not leave a stale `→ items / …` segment in the bar.
- **Back-navigation source of truth:** prefer `location.state.from` over `navigate(-1)` so a deep-link → cancel still lands somewhere sensible.

## Open Questions
None.
