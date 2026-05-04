# Milestone 2: App Shell — top bar, breadcrumb, sync dot, boards index

## Metadata
- Parent plan: `ui-redesign-main.md`
- Complexity / Work: 3 / 3
- Depends on: Milestone 1 (design tokens in `styles.css`, `useTheme()` from `state/theme-store.ts`, Tailwind already removed from build)
- Use cases: UC-1, UC-2 (chrome portion), UC-6 (toggle wiring), UC-7

## Objective
Replace the legacy header chrome with the typography-led app shell: a hairline top bar carrying a product mark, a route-aware breadcrumb-as-path, a grayscale sync-status dot, and a theme toggle. Re-render the boards index as a typographic list and restyle `ConflictBanner` and `SettingsPanel` to the hairline + mono system. After this milestone, every persistent piece of app chrome and the `/` route conform to the new visual language; the board surface and item editor remain untouched (handled in M3 and M5).

## Scope

**In:**
- New components under [apps/kanban-ui/src/app-shell/](apps/kanban-ui/src/app-shell/): `TopBar.tsx`, `Breadcrumb.tsx`, `ThemeToggle.tsx`, `SyncStatusDot.tsx`.
- A small `BreadcrumbContext` (or equivalently shaped props) so future routes (M5 item editor) can append segments without `Breadcrumb.tsx` learning new routes.
- Rewrite of [BoardListPage.tsx](apps/kanban-ui/src/pages/BoardListPage.tsx) as a typographic list (mono slug, sans name, optional sans description). All Tailwind utility classes removed; styling via design tokens only.
- Restyle of [ConflictBanner.tsx](apps/kanban-ui/src/components/ConflictBanner.tsx) and [SettingsPanel.tsx](apps/kanban-ui/src/settings/SettingsPanel.tsx) to hairline borders, mono labels/buttons where they speak in the system's voice, no rounded surfaces, no Tailwind classes, no chromatic colors beyond the single yellow accent (focus ring only).
- Edits to [App.tsx](apps/kanban-ui/src/App.tsx): remove the legacy `<header>` block and all Tailwind chrome utilities, mount `TopBar`, restyle the `switching-provider` placeholder and the `*` 404 fallback (mono, no emoji, no indigo link).
- Deletion of [ConnectionIndicator.tsx](apps/kanban-ui/src/app-shell/ConnectionIndicator.tsx) and every import of it. `SyncStatusDot` is the sole sync-state surface in chrome.
- `verify:ui` scenarios under [apps/kanban-ui/agent-browser/m5/](apps/kanban-ui/agent-browser/m5/) updated to the new selectors (see Definition of Done).

**Out:**
- Board surface (`Board`, `Cell`, `ColumnHeader`, `SwimlaneRow`, `ItemCard`, `HomelessPanel`) — M3.
- Drag-and-drop visual feedback — M4.
- `/items/:slug` route and the breadcrumb segment that names an item — M5 (the breadcrumb is built to *accept* that segment now; the route is not registered here).
- Any change to `provider/`, `providers/`, `sync/conflict-store.ts`, `sync/conflict-api.ts`, or [ConflictPanel.tsx](apps/kanban-ui/src/components/) interaction logic. Only their visual styling.

## Constraints
- The sync dot reads the same underlying signal `ConnectionIndicator` reads today: `useProvider()` + `isHttpProvider(provider)` + `provider.getConnectionState()` + `provider.onConnectionStateChange(...)`. Map those `ConnectionState` values to the three documented dot states: `online` → clean (`--ink-muted`), `connecting`/`reconnecting` → pulling (pulsing `--ink`), `offline` → dirty (solid `--ink`). `idle` and the localStorage (non-HTTP) case render the clean state. No new state machine, no new subscription path.
- Top bar height ~36 px; 1 px hairline rule beneath using `--border`. Left product mark `awesome-markdown` is mono lowercase and links to `/`. Sync dot is exactly 6 px. Breadcrumb segments are mono; all but the last are links; separator is ` / ` (mono).
- The `Breadcrumb` component is route-aware for the routes that exist *now* (`/` → `boards`; `/boards/:slug` → `boards / <slug>`). Additional segments are contributed via `BreadcrumbContext` so M5 can wrap the editor route in a provider that adds `items / <slug>` without modifying `Breadcrumb.tsx`.
- No Tailwind utility classes anywhere in files touched by this milestone. Styling lives in `styles.css` (extending the M1 token layer with component-scoped class names) or in component-scoped `style` props for one-offs. No new dependency on a CSS-in-JS library.
- No drop shadows, no border-radius on surfaces/buttons/inputs in restyled files. No chromatic colors except `--accent` on focus-visible.
- `data-testid` attributes that identify still-present behavior are preserved verbatim. New testid `sync-status-dot` replaces `connection-indicator`; the sync-engine M5 specs are updated to use it. `app-header` is preserved on the new top bar so the `wait` steps in those scenarios still resolve.

## Contracts
- `BreadcrumbContext`: a React context exposing an ordered list of trailing segments `{ label, href }[]` that downstream routes can publish; `Breadcrumb` concatenates the route-derived prefix with these and renders the last segment as non-link.
- `SyncStatusDot`: consumes the existing provider connection-state subscription (no new provider API). Renders one of three visual states (clean / pulling / dirty) with an accessible label.

## Definition of Done
- [ ] On `/`: top bar renders with `awesome-markdown` mono lowercase mark on the left, breadcrumb showing `boards` in the center, `SyncStatusDot` and `ThemeToggle` on the right, hairline rule beneath.
- [ ] On `/boards/:slug`: breadcrumb shows `boards / <slug>` with `boards` linking to `/`.
- [ ] Theme toggle flips `data-theme` via `useTheme()` and the change is visible in chrome immediately; persistence behavior is exercised by M1's tests (no new test required here).
- [ ] `SyncStatusDot` reflects the provider connection state per the mapping above; renders the clean state for the localStorage provider; updates within ~1 s of a state change (matches existing `ConnectionIndicator` behavior).
- [ ] Boards index renders as a vertical typographic list — mono slug line (e.g. `/boards/board-all`) and sans board title; no card grid, no shadows, no rounded surfaces, no Tailwind classes in the file.
- [ ] `ConflictBanner` and `SettingsPanel` render with hairline borders, mono system-voice text, no rounded chrome, no amber/red/blue/green fills (state is conveyed via mono labels and the single yellow accent on focus only); all existing functional behavior (dismiss, resolve open, test connection, save, cancel) preserved.
- [ ] `App.tsx` contains no `<header>` block, no Tailwind utility classes, and no `ConnectionIndicator` import. The 404 fallback is a mono message with a single mono link back to `/`; no emoji, no indigo.
- [ ] [ConnectionIndicator.tsx](apps/kanban-ui/src/app-shell/ConnectionIndicator.tsx) is deleted and `grep` for its identifier returns no matches in `apps/kanban-ui/src/`.
- [ ] `verify:ui` scenarios under `apps/kanban-ui/agent-browser/m5/` that referenced `[data-testid='connection-indicator']` are updated to `[data-testid='sync-status-dot']` (and assertions adapted to `data-sync-state` values: `clean | pulling | dirty`). Scenarios still pass.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm verify:ui` all pass.

## Risks & Decisions To Get Right
- **Breadcrumb extensibility:** prefer `BreadcrumbContext` over teaching `Breadcrumb.tsx` about `/items/:slug`. M5 must be able to add a segment by wrapping its page; do not bake item-route knowledge into the breadcrumb now.
- **Sync state mapping:** keep the mapping in one place (inside `SyncStatusDot.tsx` or a tiny adjacent helper). Do not invent new sync states; collapse the existing five into three. `idle` and non-HTTP both look "clean".
- **Testid migration:** rename `connection-indicator` → `sync-status-dot` and update specs in the same commit; do not ship a temporary alias.
- **SettingsPanel modal surface:** the modal is still a centered dialog over a dim backdrop, but the dialog itself is a hairline-bordered rectangle (zero radius, no shadow). Backdrop dim uses an ink-muted overlay token, not Tailwind `bg-black/40`.

## Open Questions
- None. Sync-state mapping is resolved above; further state granularity (e.g. distinguishing `pulling` from `dirty` based on a future puller signal) can be added without changing this component's shape.
