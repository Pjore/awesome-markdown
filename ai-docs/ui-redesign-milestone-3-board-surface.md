# Milestone 3: Board surface — columns, cells, swimlanes, item card, homeless

## Metadata
- Parent plan: `ui-redesign-main.md`
- Complexity: 3 | Work: 3
- Depends on: M1 (tokens, fonts, theme, Tailwind removed) and M2 (top bar, breadcrumb, conflict banner restyle)
- Use cases: UC-2 (board grid portion), UC-3 (item card reading)

## Objective
Apply the typography-led, hairline-tile visual system to the board surface: columns, cells, swimlanes, item cards, the homeless panel, and outer board chrome. Introduce the pure `deriveSummary` helper that powers the new card summary line. The board, after this milestone, must visually match decisions Q5/Q7/Q8/Q9 in light and dark themes, with item cards rendering the three-layer (title/summary/tags) form. DnD highlight states are stubbed via `data-*` hooks but styled by M4; clicking a card already navigates to `/items/:slug` (route lands in M5).

## Scope

**In:**
- Rewrite styling and structure of `Board.tsx`, `ColumnHeader.tsx`, `Cell.tsx` (idle state only), `SwimlaneRow.tsx`, `ItemCard.tsx`, `HomelessPanel.tsx` to use design tokens; remove every Tailwind utility class from these files.
- New `apps/kanban-ui/src/lib/derive-summary.ts` plus its unit tests.
- Wire column item count into `ColumnHeader` (header receives or computes the count for its column across all visible cells).
- `ItemCard` calls `useNavigate(\`/items/\${item.slug}\`)` on click; the route itself is registered in M5.
- Stable `data-*` attributes on `Cell` and the placeholder slot for M4 to style: `data-drop-state="idle|valid|invalid"`, `data-drop-placeholder` on the prospective insertion slot. Default (`idle`) state styled here; non-idle styling deferred to M4.
- Update `apps/kanban-ui/agent-browser/m3/` verify:ui spec to match new selectors, typography assertions, and the absence of Tailwind classes.
- Add vitest config and devDeps to `apps/kanban-ui/` so `derive-summary` tests run under `pnpm test` (no test runner currently exists in this app).

**Out:**
- DnD active-state visuals (yellow valid border, dashed invalid border, insertion rule, drag opacity beyond what already exists) — M4.
- Item editor page and `/items/:slug` route registration — M5.
- Top bar, breadcrumb, conflict banner, settings panel, boards index — M2.
- Any change to `packages/contracts`, providers, filter-engine, or DnD logic in `board/dnd/`.
- Adding new frontmatter fields. Tags read only from the existing `tags[]` passthrough on `Item`.

## Constraints
- No Tailwind utility classes anywhere in files modified by this milestone. All styling via design-token CSS in `styles.css` and component-scoped class names that resolve to those tokens.
- No `border-radius`, no `box-shadow`, no chromatic colors in any board-surface element. Borders are 1 px `--border`; ink is `--ink` / `--ink-muted`.
- Item title uses `--font-sans` (Inter Tight); all system-voice text (column header, count, tags row, swimlane label, homeless header) uses `--font-mono` uppercase with letter-spacing 0.08em.
- Tags row sources **only** `item.tags` (frontmatter passthrough array). Do not surface `priority`, `assignee`, or any other passthrough field on the card. The conflict-lock indicator on cards stays (re-styled to grayscale, no emoji background).
- Summary line uses `-webkit-line-clamp: 2` with `display: -webkit-box` and `overflow: hidden`; do not invent a JS truncation.
- Existing `data-testid` values that identify still-present behavior are preserved verbatim (`item-card-${slug}`, `item-title-${slug}`, `column-header-${slug}`, `swimlane-row-${slug}`, `swimlane-label-${slug}`, `homeless-panel`, `homeless-panel-toggle`, `homeless-item-list`, `homeless-item-${slug}`, `board`, `board-title`, `swimlane-rows`, `conflict-lock-${slug}`). New ids may be added for the summary, tags row, and column count.

## Contracts
- `deriveSummary(body: string): string` — pure helper in `apps/kanban-ui/src/lib/derive-summary.ts`. Returns the first non-empty line of the markdown body that is not a heading (lines matching `^#+\s` are headings), with inline markdown stripped (`*`, `_`, backtick, and `[text](url)` → `text`). Returns the empty string when no qualifying line exists. Whitespace-only lines are skipped. Imported by `ItemCard.tsx`.
- `ColumnHeader` receives the count for its column (either as a prop or via a helper that takes the visible cells). The wiring point is `Board.tsx` where columns are mapped — pick whichever shape is simplest and keeps `ColumnHeader` a pure presentational component.

## Definition of Done
- [ ] On `/boards/board-all` in both light and dark themes:
  - Column headers render as `TODO · 3` (uppercase, mono 11 px, letter-spacing 0.08em) with a 1 px `--border` rule beneath. No fill, pill, or badge.
  - Cells render with 1 px `--border` border, zero radius, no shadow, transparent fill in their idle state, and carry `data-drop-state="idle"`.
  - Swimlane rows align with the new column grid; the swimlane label renders in mono uppercase when the swimlane axis is non-synthetic. No background fill, no decorative chrome.
  - Item cards render the three layers per Q8 (title Inter Tight 14/500 `--ink`; summary Inter Tight 12.5/400 `--ink-muted`, 2-line clamp; tags `TAG-A · TAG-B` mono 10.5 px uppercase letter-spaced `--ink-muted`). Padding 10 px / 12 px. Cards with no tags omit the tags row; cards with empty/blank summary omit the summary row.
  - Clicking a card navigates to `/items/:slug` (target route is the M5 stub or 404 — the navigation call itself is the assertion here).
  - `HomelessPanel` header reads `HOMELESS · N` in mono uppercase with hairline rule; items inside use the same card typography (or a stripped one-line variant — pick the simplest expression that matches the system).
  - `Board.tsx` outer chrome (background fills, borders, shadows, board-title block styling) uses only design tokens; the redundant in-board title block is removed since the breadcrumb already names the board (decisions Q6).
- [ ] No file modified in this milestone contains a Tailwind utility class. Grep confirms.
- [ ] No element on the board surface has a non-zero `border-radius` or `box-shadow` (verify via the agent-browser spec).
- [ ] `deriveSummary` unit tests cover:
  - Empty string input → `""`.
  - Body containing only headings (single `#`, multiple `###`) → `""`.
  - Body with leading blank lines and a heading before the first paragraph → first paragraph line returned.
  - Inline markdown stripping: `*bold*`, `_italic_`, `` `code` ``, mixed in one line.
  - Link rewriting: `[label](https://x)` → `label`; multiple links in one line; bare URLs left untouched.
  - Whitespace-only lines treated as empty.
  - Body whose first non-heading line is the very first line (no leading blanks) returns that line, trimmed.
- [ ] `apps/kanban-ui/agent-browser/m3/runner.mjs` verify:ui spec updated:
  - Asserts the new column header text format and computed font-family `JetBrains Mono`.
  - Asserts presence of `[data-drop-state="idle"]` on every cell.
  - Asserts the three-layer item card structure (title, optional summary line, optional tags row) and that the tags row contains a `·` separator when more than one tag is present.
  - Asserts a click on an item card causes a navigation to `/items/<slug>` (URL change; the M5 page is not yet asserted).
  - Asserts no element under `[data-testid="board"]` reports a non-zero `border-radius` or `box-shadow`.
- [ ] `apps/kanban-ui/vitest.config.ts` exists; `vitest` (and any required `@types`) added to devDependencies; `pnpm test` from the repo root runs the new unit tests; `pnpm typecheck`, `pnpm lint`, `pnpm verify:ui` all pass.

## Risks & Decisions To Get Right
- **Column count source:** compute the count from the *visible* cells passed into the board (sum `cell.items.length` for cells whose `columnSlug === column.slug`). Do not refetch or recompute filters in `ColumnHeader` itself.
- **Drop-state hooks:** add `data-drop-state` and `data-drop-placeholder` now even though M4 styles them. Putting the data attributes in M3 prevents M4 from having to re-touch every cell file.
- **Conflict-lock indicator on cards:** keep the behavior, drop the emoji and amber colors. Render as a small mono `LOCKED` glyph in `--ink-muted`, or a 1 px outlined square — pick a non-chromatic affordance consistent with the system. The `data-conflict` and `data-testid="conflict-lock-${slug}"` attributes stay.
- **Card click vs drag:** the existing `useSortable` listeners must continue to drive drag. Click-to-navigate must not fire after a drag gesture; gate the navigation on a non-dragging pointer-up (the existing `isDragging`/activation-distance pattern is sufficient — do not add a synthetic click guard unless drag still triggers navigation in manual testing).
- **Summary derivation in renderer:** call `deriveSummary(item.body ?? "")` once per render in `ItemCard`; do not memoize prematurely. If profiling later shows it matters, memoize then.
- **Homeless header:** `HOMELESS · N` is the spec, not `⚠ N homeless items`. Drop the warning emoji. Keep the toggle behavior and `aria-expanded`.

## Open Questions
- None. Q5/Q7/Q8/Q9 in the decisions doc are unambiguous for this scope.
