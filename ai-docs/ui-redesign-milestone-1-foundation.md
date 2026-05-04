# Milestone 1: Foundation — tokens, fonts, theme system, Tailwind removal

## Metadata
- Parent plan: [ui-redesign-main.md](ui-redesign-main.md)
- Authoritative design source: [ui-redesign-decisions.md](ui-redesign-decisions.md) (Q1–Q11 + CSS variable sketch)
- Complexity: 3 | Work: 2
- Depends on: none (first milestone of the redesign branch)
- Use cases: UC-6 in full; foundation for UC-1, UC-2, UC-3, UC-4, UC-5, UC-7

## Objective
Replace the Tailwind-based styling layer in `apps/kanban-ui/` with a self-contained, design-token CSS system, self-hosted fonts, and a persistent theme toggle. After this milestone the app still builds and serves, but visual polish lives entirely in `styles.css` and CSS variables; component restyling lands in M2/M3/M5.

## Scope

**In:**
- New design-token `styles.css` (light + dark via `[data-theme="dark"]`) per the decisions doc CSS variable sketch.
- Self-hosted JetBrains Mono (400, 500) and Inter Tight (400, 500) WOFF2 files under `apps/kanban-ui/public/fonts/`, loaded via `@font-face` (`font-display: swap`, ligatures off on mono).
- A short font `LICENSE` / `README` notice in `public/fonts/` covering both families' license terms and source URLs.
- `theme-store.ts` exposing `useTheme(): { theme, toggle, set }`, persisted to `localStorage`, reflected on `document.documentElement.dataset.theme`.
- Pre-paint inline script in `index.html` that resolves theme (localStorage → `prefers-color-scheme`) and sets `data-theme` before first render.
- Base resets: `border-radius: 0` on form controls and buttons; `:focus-visible` outline uses `--accent`; no `box-shadow` utilities defined.
- Full Tailwind removal from the kanban-ui app: dependency, Vite plugin wiring, any tailwind/postcss config files, and the `@import "tailwindcss"` directive. App must build and `pnpm dev` must serve.

**Out:**
- Restyling individual components (TopBar, BoardListPage, ItemCard, drag feedback, ItemEditorPage, ConflictBanner, SettingsPanel) — handled in M2/M3/M4/M5.
- Removing Tailwind utility class strings from JSX (`className="h-screen flex flex-col …"`). They simply become inert. Cleanup happens per-component as those components are restyled.
- Any `summary` derivation, breadcrumb model, sync-dot logic, or item-editor route work.
- Changes outside `apps/kanban-ui/`.

## Constraints
- No CDN font references anywhere — all font files must be served from `public/fonts/`.
- Theme key in `localStorage` is a single string under one key; pick a stable key name and use it consistently in the pre-paint script and the store. Document the key in a one-line comment in `theme-store.ts`.
- The pre-paint script must be inline in `index.html`, run before the React bundle, and must not throw if `localStorage` is unavailable (fall back to `prefers-color-scheme`, then `light`).
- The theme store and the pre-paint script must agree on: key name, allowed values (`'light' | 'dark'`), and that the source-of-truth at runtime is `document.documentElement.dataset.theme`.
- CSS variable names and values must match the decisions doc sketch verbatim (`--bg`, `--surface`, `--ink`, `--ink-muted`, `--border`, `--accent`, `--font-mono`, `--font-sans`). Do not invent new tokens in this milestone.
- Do not introduce a CSS framework or utility library to replace Tailwind. Plain CSS only.
- Existing components keep their current Tailwind class strings untouched in this milestone.

## Contracts
- `useTheme()` from `apps/kanban-ui/src/state/theme-store.ts`: returns `{ theme: 'light' | 'dark', toggle(): void, set(t): void }`; mutating either `toggle` or `set` updates `document.documentElement.dataset.theme` and `localStorage` synchronously. Consumed by `ThemeToggle` and any future theme-aware code in later milestones.

## Step-by-step changes (file-level, outcome-only)

1. **Remove Tailwind from the build.**
   - `apps/kanban-ui/package.json`: drop `tailwindcss` and `@tailwindcss/vite` from `devDependencies`. Run `pnpm install` so the lockfile updates.
   - `apps/kanban-ui/vite.config.ts`: remove the `@tailwindcss/vite` import and its entry from the `plugins` array. Leave the React plugin and the `/sync-engine` proxy intact.
   - Delete any `tailwind.config.*` or `postcss.config.*` files in `apps/kanban-ui/` if present. (Repo currently has none — verify and skip if so.)
   - Update `apps/kanban-ui/README.md`'s "Styles" line to reflect the new system.

2. **Add self-hosted fonts.**
   - Create `apps/kanban-ui/public/fonts/` and place WOFF2 files for JetBrains Mono (400, 500) and Inter Tight (400, 500). Source from the official upstream releases (JetBrains Mono GitHub release, rsms/inter release). No CDN references.
   - Add a short `LICENSE.md` (or `README.md`) in that folder noting each family, its SIL OFL license, and the upstream source URL.

3. **Rewrite `apps/kanban-ui/src/styles.css`.**
   - Remove `@import "tailwindcss"`.
   - Declare `@font-face` blocks for both families and both weights, pointing at `/fonts/...`, with `font-display: swap` and `font-feature-settings: "liga" 0, "calt" 0` on the mono family.
   - Define `:root` and `[data-theme="dark"]` blocks with the variables from the decisions doc (verbatim hex values).
   - Add minimal base styles only: `html, body { background: var(--bg); color: var(--ink); font-family: var(--font-sans); }`, monospace fallback for `code, kbd, pre`, zero `border-radius` on `button, input, textarea, select`, transparent default backgrounds for those controls, `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.
   - Do not add component or layout styles in this milestone.

4. **Create `apps/kanban-ui/src/state/theme-store.ts`.**
   - Export `useTheme()` matching the contract above. Implementation choice (Zustand vs plain `useSyncExternalStore` vs context) is up to the agent; mirror the convention used by other files in `src/state/` if one is established, otherwise pick the simplest option that supports cross-component updates.
   - On first read, hydrate from `document.documentElement.dataset.theme` (set by the pre-paint script) so React state matches the DOM without a flicker.

5. **Update `apps/kanban-ui/index.html`.**
   - Add an inline `<script>` in `<head>`, before the module script, that reads the theme from localStorage (or `prefers-color-scheme`, defaulting to `light`) and assigns `document.documentElement.dataset.theme` accordingly. Wrap in `try/catch`.
   - No other markup changes (title update is fine but optional).

6. **Smoke-fix any build-blocking references.**
   - If removing the Tailwind plugin causes a build error from a file that imports Tailwind directives, resolve it. Do not chase JSX `className` cleanup.

## Definition of Done
- [ ] `pnpm install` succeeds with `tailwindcss` and `@tailwindcss/vite` absent from `apps/kanban-ui/package.json` and from the lockfile entry for that workspace.
- [ ] `grep -R "tailwind" apps/kanban-ui/{src,vite.config.ts,index.html,package.json}` returns no matches (README mention may remain only if rewritten to describe the new system).
- [ ] `pnpm --filter kanban-ui build` succeeds.
- [ ] `pnpm dev` (or services start) serves the UI; navigating to `/` renders without console errors and applies the body background from `--bg`.
- [ ] In DevTools, `document.documentElement.dataset.theme` is `'light'` or `'dark'` before the first React render (verify by checking `<html data-theme="…">` in the initial HTML or by a breakpoint on the inline script).
- [ ] Toggling theme via `useTheme().toggle()` (e.g. from a temporary devtools call) flips `<html data-theme>` and persists across reload.
- [ ] System `prefers-color-scheme` flip changes the initial theme on a fresh-storage profile.
- [ ] Both fonts load from `/fonts/...` (Network tab shows local 200s, no external font requests).
- [ ] Unit tests exist for `theme-store.ts` covering: hydration from localStorage, fallback to `prefers-color-scheme` when storage is empty, persistence on `toggle`, and DOM `data-theme` reflection. (Add a vitest config for `apps/kanban-ui` if none exists; mirror the conventions used by `packages/contracts` or `packages/filter-engine`.)
- [ ] `pnpm typecheck && pnpm lint` pass; existing `pnpm test` and `pnpm verify:ui` suites still pass (Tailwind utility classes in JSX remain inert, not removed).

## Risks & Decisions To Get Right
- **FOUC.** The pre-paint script must run before the bundle and before any stylesheet that depends on `[data-theme]`; place it in `<head>` ahead of the module `<script>` and any `<link>`/style tags.
- **Tailwind reset side-effects disappearing.** Tailwind's preflight provided default resets that some current components silently rely on (margins, list styles, image block display). Expect cosmetic regressions until M2/M3 restyle each component — this is acceptable for M1, but the app must still render and be navigable.
- **localStorage SSR/sandboxing.** The pre-paint script and the store must both guard against `localStorage` access throwing.
- **Font weight discipline.** Ship only the four weight files specified. Adding more weights now will cascade into later milestones expecting them.
- **Don't pre-declare component classes.** Resist adding `.card`, `.column-header`, etc. — those belong to M2/M3 where they're consumed.

## Open Questions
- None blocking. Confirm during implementation that the chosen `localStorage` key name (e.g. `awesome-markdown:theme`) is acceptable; document it in the store and the inline script.

## References
- [ui-redesign-main.md](ui-redesign-main.md) — Section 6, Milestone 1 row; Section 4 change overview rows for `styles.css`, `public/fonts/`, `package.json`, `vite.config.ts`, `theme-store.ts`, `index.html`.
- [ui-redesign-decisions.md](ui-redesign-decisions.md) — Q1–Q4 (typography + theme), Q5 (zero radius / no shadow), CSS variable sketch.
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) — repo conventions, `.js` import suffixes, file size limits.
