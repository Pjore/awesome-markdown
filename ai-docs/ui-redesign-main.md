# Implementation Plan: ui-redesign

## 0. Metadata
- **Complexity:** 4
- **Uncertainty:** 1
- **Work:** 3
- **Scope:** Replace all visual styling in `apps/kanban-ui/` with the typography-led minimalist system specified in [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md). Introduces a new full-page item editor route and a theme toggle.
- **Non-goals:**
  - No changes to `packages/contracts`, `packages/filter-engine`, `packages/provider-localstorage`, or any provider HTTP/REST contract.
  - No changes to `apps/provider-fs` or `apps/sync-engine`.
  - No new domain fields, no schema changes (summary derived from existing `body`; tags read from existing frontmatter `tags[]`).
  - No accessibility audit beyond focus-visible and contrast on the chosen palette.
  - No animation/motion system (drag feedback is static state-based).

## 1. Problem Statement
The current UI is a generic Tailwind dashboard (system sans, indigo links, white rounded cards with shadows, bulky header) that communicates nothing about the product being a git-backed, markdown-file-driven kanban. The redesign establishes a distinctive typography-led visual language that makes the file-system-as-domain-model legible at a glance.

## 2. Constraints & Assumptions
- All changes confined to [apps/kanban-ui/](apps/kanban-ui/).
- Tailwind v4 is removed from `apps/kanban-ui/`. All styling is driven by design-token CSS in `styles.css`. Tailwind dependency, config, and `@import "tailwindcss"` directives are deleted.
- Custom CSS using design tokens (CSS variables) is the sole styling mechanism. Layout primitives (flex/grid) are expressed as small token-driven utility classes or component-scoped styles.
- JetBrains Mono and Inter Tight are self-hosted under `apps/kanban-ui/public/fonts/` and loaded via `@font-face`. No font CDN.
- Theme is persisted to `localStorage` under a single key; default follows `prefers-color-scheme`.
- The full-page item editor at `/items/:slug` is the only item editor. Any prior inline/modal editor code is deleted, not kept alongside.
- The app already uses `react-router-dom` v6+ for routing.
- `data-testid` attributes that identify behavior still present in the redesign are preserved verbatim; ids attached to deleted markup are removed and replaced with new ids on the new markup. `verify:ui` specs are updated to match — no compatibility shims.

## 3. Target State (Definition of Done)

**Functional:**
- Top bar shows product mark on the left, breadcrumb path in the center, sync status circle and theme toggle on the right, separated by a single hairline rule.
- Breadcrumb reflects the current route: `boards / board-all` on a board, `boards / board-all → items / refactor-db` on the editor.
- Boards index page lists boards as a typographic list, not a card grid.
- Column header reads `TODO · 3` in mono uppercase with a hairline rule beneath.
- Item card renders title (sans), summary (first non-empty, non-heading line of body, 2-line clamp), and tags row (`TAG-A · TAG-B` mono uppercase).
- Dragging a card sets opacity 0.4; valid drop targets show 1.5 px yellow border; invalid/non-invertible cells show dashed muted-gray border with `not-allowed` cursor; insertion placeholder is a 2 px solid yellow horizontal rule.
- Clicking an item navigates to `/items/:slug` (full-page editor with breadcrumb back-navigation); browser back returns to the originating board.
- Theme toggle switches between light and dark, persisting the choice; default follows OS preference.
- Focus ring is the highlighter-yellow accent on every interactive element.

**Non-functional:**
- No drop shadows anywhere in the UI.
- No rounded corners (`border-radius: 0`) on surfaces and inputs.
- No chromatic colors other than the single yellow accent and grayscale ink/border tokens.
- All system-voice text (nav, slugs, breadcrumb, headers, counts, tags, metadata) renders in JetBrains Mono.
- All user-voice text (item titles, body) renders in Inter Tight.

**Success Criteria:**
- [ ] Visual inspection of `/`, `/boards/:slug`, `/items/:slug` matches each clause of [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md) Q1–Q11.
- [ ] Light and dark themes both render with the documented hex values; toggle persists across reload.
- [ ] No element in the rendered DOM has a non-zero `box-shadow` or non-zero `border-radius` on a card/button/input surface (spot-checked via DevTools or `verify:ui`).
- [ ] Dragging an item produces only the four documented visual states (opacity, valid yellow, invalid dashed, insertion placeholder) — no other highlights or fills.
- [ ] Existing `pnpm verify:ui` and `pnpm test` both pass.
- [ ] Existing kanban behavior (filter-driven projection, drop mutations, homeless view, conflict banner, settings panel) is unchanged in function.

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `apps/kanban-ui/src/styles.css` | Replace | Rewrite as design-token stylesheet: CSS variables, `@font-face`, base resets, small utility classes for system primitives. |
| `apps/kanban-ui/public/fonts/` | New | Self-hosted JetBrains Mono and Inter Tight WOFF2 files plus a `LICENSE` note. |
| `apps/kanban-ui/package.json` | Modify | Remove `tailwindcss` and any Tailwind-only plugin dependencies. |
| `apps/kanban-ui/vite.config.ts` | Modify | Remove Tailwind plugin wiring if present. |
| `apps/kanban-ui/postcss.config.*` / `tailwind.config.*` | Remove | Delete Tailwind config files entirely. |
| `apps/kanban-ui/src/state/theme-store.ts` (new) | New | Theme state hook — persists `light`/`dark` to localStorage, hydrates from `prefers-color-scheme`. |
| `apps/kanban-ui/src/app-shell/TopBar.tsx` (new) | New | Persistent hairline top bar: product mark, breadcrumb, sync status, theme toggle. |
| `apps/kanban-ui/src/app-shell/Breadcrumb.tsx` (new) | New | Route-aware breadcrumb-as-path component. |
| `apps/kanban-ui/src/app-shell/ThemeToggle.tsx` (new) | New | Theme toggle icon button. |
| `apps/kanban-ui/src/app-shell/SyncStatusDot.tsx` (new) | New | 6 px sync status circle (clean / pulling / dirty); replaces or wraps `ConnectionIndicator`. |
| `apps/kanban-ui/src/App.tsx` | Modify | Remove old header markup, mount `TopBar`, register `/items/:slug` route, drop legacy Tailwind chrome classes. |
| `apps/kanban-ui/src/pages/BoardListPage.tsx` | Modify | Re-render boards as typographic list, not card grid. |
| `apps/kanban-ui/src/pages/BoardPage.tsx` | Modify | Strip outer chrome; rely on top bar; pass active board to breadcrumb context. |
| `apps/kanban-ui/src/pages/ItemEditorPage.tsx` (new) | New | Full-page item editor mounted at `/items/:slug`. |
| `apps/kanban-ui/src/board/Board.tsx` | Modify | Remove background/shadow chrome; use design tokens. |
| `apps/kanban-ui/src/board/ColumnHeader.tsx` | Modify | Mono uppercase header `TODO · 3` with hairline below; remove pills/fills. |
| `apps/kanban-ui/src/board/Cell.tsx` | Modify | Hairline border, transparent fill, drop-target/invalid/placeholder states. |
| `apps/kanban-ui/src/board/SwimlaneRow.tsx` | Modify | Match new grid metrics; remove decorative chrome. |
| `apps/kanban-ui/src/board/ItemCard.tsx` | Modify | Three-layer layout (title / summary / tags); navigate to `/items/:slug` on click. |
| `apps/kanban-ui/src/board/HomelessPanel.tsx` | Modify | Match new card and panel typography. |
| `apps/kanban-ui/src/board/ItemEditor.tsx` | Remove | Deleted along with all imports/usages; replaced by `ItemEditorPage`. |
| `apps/kanban-ui/src/board/dnd/` | Modify | Update visual feedback hooks/styles to use new tokens; logic unchanged. |
| `apps/kanban-ui/src/lib/derive-summary.ts` (new) | New | Pure function: first non-empty, non-heading line of markdown body, inline-markdown stripped. |
| `apps/kanban-ui/src/components/ConflictBanner.tsx` | Modify | Restyle to match minimalist system (hairline + mono). All Tailwind utility classes removed. |
| `apps/kanban-ui/src/settings/SettingsPanel.tsx` | Modify | Restyle to match (hairline borders, mono labels, no rounded chrome). All Tailwind utility classes removed. |
| `apps/kanban-ui/src/app-shell/ConnectionIndicator.tsx` | Remove | Deleted; replaced by `SyncStatusDot`. |
| `apps/kanban-ui/index.html` | Modify | Update `<title>`, set `data-theme` attribute on `<html>` early to avoid flash. |
| `apps/kanban-ui/agent-browser/` (verify:ui specs) | Modify | Update any selectors/snapshots affected by markup or styling changes. |

## 5. Use Cases

### UC-1: User opens the app
**Actor:** User
**Trigger:** Navigates to `/`.
**Flow:**
1. App loads, theme is hydrated from localStorage or OS preference, applied to `<html data-theme>` before first paint.
2. Top bar renders with product mark, empty breadcrumb (or `boards`), sync dot, theme toggle.
3. Boards index page renders as a typographic list of board slugs and names.
4. User clicks a board slug.

**Input:** none (route + persisted theme).
**Output:** boards index DOM in the active theme.
**Errors:** provider not yet ready → existing `isSwitching` placeholder, restyled.

### UC-2: User navigates to a board
**Actor:** User
**Trigger:** Clicks a board slug in the index, or visits `/boards/:slug` directly.
**Flow:**
1. Route resolves to `BoardPage`.
2. Top bar breadcrumb updates to `boards / <slug>`.
3. Board renders columns (and swimlanes if axis active) with mono uppercase headers and hairline grid.
4. Each cell displays its filtered items as three-layer cards.
5. Homeless items (matching no column) appear in the homeless panel below the grid.

**Input:** board slug from URL.
**Output:** rendered board grid with cards.
**Errors:** unknown slug → 404 placeholder restyled to match system.

### UC-3: User reads an item card
**Actor:** User
**Trigger:** Card is rendered in a cell.
**Flow:**
1. Card displays title (Inter Tight 14/500).
2. Card derives summary as first non-empty, non-heading line of `body`, strips inline markdown, clamps to 2 lines.
3. Card displays `tags[]` (if present) as `TAG-A · TAG-B` in mono uppercase, otherwise omits the tags row.

**Input:** item record (`title`, `body`, frontmatter `tags[]`).
**Output:** three-layer card DOM.
**Errors:** missing body → summary row omitted; missing tags → tags row omitted.

### UC-4: User drags an item between cells
**Actor:** User
**Trigger:** Pointer-down on a card, drag begins.
**Flow:**
1. Source card opacity drops to 0.4; no shadow, no scale.
2. As pointer enters each cell, the cell signals validity:
   - Valid (filter combination is invertible) → 1.5 px yellow border on the cell.
   - Invalid (non-invertible filter) → 1 px dashed muted-gray border, cursor `not-allowed`.
3. As pointer moves between cards within a valid cell, a 2 px solid yellow horizontal rule appears at the prospective insertion index.
4. On drop into a valid cell, the existing mutation pipeline runs (single file write); UI re-renders.
5. On drop into an invalid cell, no mutation; visual states clear.

**Input:** drag gesture, source/target cell identity.
**Output:** at most one item file write; updated board projection.
**Errors:** drop on invalid cell is a no-op; existing conflict path is unchanged.

### UC-5: User opens the item editor
**Actor:** User
**Trigger:** Clicks an item card title (or the card itself, per existing behavior).
**Flow:**
1. Router navigates to `/items/:slug`; board unmounts.
2. Top bar breadcrumb extends to `boards / <board-slug> → items / <item-slug>`.
3. Editor renders: large mono slug label, Inter Tight title input, mono body textarea, save/cancel actions.
4. User edits title and/or body, clicks save → existing item-update path runs (single PATCH).
5. User clicks cancel or browser back → returns to originating board route.

**Input:** item slug from URL; title/body edits.
**Output:** at most one item file write.
**Errors:** save failure → inline error in the editor (existing error surfacing reused).

### UC-6: User toggles the theme
**Actor:** User
**Trigger:** Clicks theme toggle in top bar.
**Flow:**
1. Theme store flips `light`↔`dark`.
2. `data-theme` on `<html>` updates; CSS variables swap.
3. Choice is persisted to localStorage.

**Input:** click.
**Output:** updated DOM and persisted preference.
**Errors:** localStorage unavailable → in-memory only, no error surfaced.

### UC-7: User observes sync status
**Actor:** User
**Trigger:** Sync state changes (clean / pulling / dirty) from the existing sync subsystem.
**Flow:**
1. `SyncStatusDot` subscribes to existing sync/connection state.
2. Renders a 6 px circle; color drawn from grayscale tokens (no chromatic states) — clean = `--ink-muted`, pulling = pulsing `--ink`, dirty = solid `--ink`.

**Input:** sync state event.
**Output:** updated dot.
**Errors:** stream disconnect → falls back to existing offline indication, restyled.

### Contracts

**Contract: summary-derivation**
- **Provider:** `apps/kanban-ui/src/lib/derive-summary.ts`
- **Consumer:** `apps/kanban-ui/src/board/ItemCard.tsx`
- **Shape:** `deriveSummary(body: string): string` → returns the first non-empty, non-heading line of the markdown body with inline markdown (`*`, `_`, `` ` ``, `[text](url)`) stripped to plain text; returns empty string if none.

**Contract: theme-store**
- **Provider:** `apps/kanban-ui/src/state/theme-store.ts`
- **Consumer:** `App.tsx`, `ThemeToggle.tsx`, anything reading current theme.
- **Shape:** `useTheme(): { theme: 'light' | 'dark', toggle(): void, set(t: 'light' | 'dark'): void }`. Theme is also reflected as `document.documentElement.dataset.theme`.

**Contract: breadcrumb model**
- **Provider:** route + active board context.
- **Consumer:** `Breadcrumb.tsx`.
- **Shape:** ordered list of segments `{ label: string, href: string | null }`; mono-rendered, last segment is non-link.

## 6. Milestones

### Milestone 1: Foundation — tokens, fonts, theme system, Tailwind removal
**Objective:** Establish the design-token CSS, self-hosted font loading, theme toggle/persistence, and remove Tailwind from the kanban-ui app.

**Deliverables:**
- New `styles.css` driven by CSS variables for both themes (per [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md) "CSS variable sketch").
- Self-hosted JetBrains Mono (400, 500) and Inter Tight (400, 500) WOFF2 files under `apps/kanban-ui/public/fonts/` with license notice; loaded via `@font-face` with `font-display: swap`.
- `theme-store.ts` with `useTheme()` hook, localStorage persistence, `prefers-color-scheme` default.
- Inline pre-paint script in `index.html` to apply `data-theme` before first render (no flash).
- Base resets: zero radii on default form elements, focus-visible ring uses `--accent`.
- Tailwind removed: `tailwindcss` (and Tailwind-only plugins) uninstalled, config files deleted, `@import "tailwindcss"` removed from CSS, Vite/PostCSS wiring updated. App still builds and runs (with intentionally unstyled markup until subsequent milestones).

**Use Cases:** UC-6 (full); foundation for UC-1, UC-2, UC-3, UC-4, UC-5, UC-7.

**Complexity:** 3 | **Work:** 2

---

### Milestone 2: App shell — top bar, breadcrumb, sync dot, boards index
**Objective:** Replace the current header chrome and boards-index visuals with the typography-led shell.

**Deliverables:**
- `TopBar.tsx`, `Breadcrumb.tsx`, `ThemeToggle.tsx`, `SyncStatusDot.tsx`.
- `App.tsx` mounts the new top bar; legacy header markup removed.
- `BoardListPage.tsx` re-rendered as typographic list.
- `ConflictBanner.tsx` and `SettingsPanel.tsx` restyled to the new system.
- `ConnectionIndicator.tsx` either restyled or absorbed into `SyncStatusDot`.

**Use Cases:** UC-1, UC-2 (chrome portion), UC-7.

**Complexity:** 3 | **Work:** 3

---

### Milestone 3: Board surface — columns, cells, item card
**Objective:** Apply the hairline-tile visual system to columns, cells, swimlanes, item cards, and the homeless panel; introduce summary derivation and tags row.

**Deliverables:**
- `ColumnHeader.tsx` mono uppercase + count + hairline.
- `Cell.tsx` hairline borders, transparent fill, no shadow, zero radius.
- `SwimlaneRow.tsx` matching grid metrics.
- `ItemCard.tsx` three-layer layout (title / summary / tags) with click → `/items/:slug`.
- `derive-summary.ts` pure helper with unit tests.
- `HomelessPanel.tsx` restyled.
- `Board.tsx` background/shadow chrome stripped.

**Use Cases:** UC-2 (board grid portion), UC-3.

**Complexity:** 3 | **Work:** 3

---

### Milestone 4: Drag-and-drop visual language
**Objective:** Replace existing drop-target highlights with the four documented states without altering DnD logic.

**Deliverables:**
- Updated styles/hooks under `apps/kanban-ui/src/board/dnd/` for: dragging opacity, valid yellow border, invalid dashed gray border + `not-allowed`, insertion placeholder yellow rule.
- Removal of any prior highlight/fill states (background tints, shadows, scale animations).
- Verification that `verify:ui` drag scenarios still pass.

**Use Cases:** UC-4.

**Complexity:** 3 | **Work:** 2

---

### Milestone 5: Full-page item editor route
**Objective:** Introduce `/items/:slug` as the canonical item editor and remove the legacy inline editor.

**Deliverables:**
- `ItemEditorPage.tsx` (large mono slug label, Inter Tight title input, mono body textarea, save/cancel).
- Route registered in `App.tsx`; breadcrumb extended via active-board context.
- `ItemCard` click navigates with `useNavigate`; back-navigation returns to originating board.
- Removal of `apps/kanban-ui/src/board/ItemEditor.tsx` (or reduction to a thin wrapper that re-exports the page) and any inline-editor references.
- `verify:ui` updated for the new route.

**Use Cases:** UC-5.

**Complexity:** 3 | **Work:** 3

---

**Review Checkpoint:** After creating this main plan, pause for user review before generating detailed milestone files.

## 7. Validation & Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm verify:ui` all pass at the end of each milestone.
- Unit tests for `derive-summary.ts` cover: empty body, body starting with heading(s), inline markdown stripping, multi-line clamping input shape.
- Unit (or hook) test for `theme-store.ts` covers: hydration from localStorage, fallback to `prefers-color-scheme`, persistence on toggle.
- Manual visual verification against [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md) Q1–Q11 on `/`, `/boards/board-all`, `/items/<any-item-slug>`, in both themes, with at least one drag interaction (valid + invalid drop).
- Verify no element on any rendered route has a non-zero `border-radius` on a card/button/input surface or any `box-shadow` (DevTools spot check).

## 8. Rollback Strategy
- Each milestone lands as one or more conventional-commit PRs against a single redesign feature branch; reverting a milestone is a `git revert` of its commits.
- The design tokens layer (Milestone 1) is additive — reverting it requires reverting subsequent milestones first, since they consume the tokens. Plan rollback in reverse milestone order.
- No data, contract, or provider changes are introduced, so rollback has no migration concerns.

## 9. Open Questions
- Sync status states: confirm exactly which underlying signal from the sync subsystem maps to `clean` / `pulling` / `dirty`. Decide in Milestone 2.
- WOFF2 weight subset: which JetBrains Mono weights (400, 500) and Inter Tight weights (400, 500) ship as the only files. Confirmed by decisions doc; verify file sizes acceptable in Milestone 1.

## 10. References
- [ai-docs/ui-redesign-decisions.md](ai-docs/ui-redesign-decisions.md) — authoritative design decisions (Q1–Q11, CSS variable sketch).
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — project tech stack and conventions.
- JetBrains Mono: https://www.jetbrains.com/lp/mono/
- Inter Tight: https://rsms.me/inter/
- MDN `prefers-color-scheme`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
