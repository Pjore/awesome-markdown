# Milestone 2: Side-by-side diff modal in kanban-ui

## Metadata
- Parent plan: `conflict-diff-view-main.md`
- Complexity: 3 / Work: 2
- Depends on: Milestone 1 (sync-engine returns `oursContent`/`theirsContent`/`oursTruncated`/`theirsTruncated` in `ConflictPathEntry`)
- Use cases: UC-1 (client side), UC-2 (client side)

## Objective
Replace the path-list conflict modal in kanban-ui with a VS Code-style side-by-side line diff per conflicting path, and remove the "Open externally" affordance from the UI. After this milestone the user can read the actual ours-vs-theirs differences in-modal before choosing a side.

## Scope

**In:**
- New `ConflictDiff.tsx` presentational component rendering an aligned side-by-side line diff with add/remove styling, line numbers, and a truncation banner.
- Rewrite of `ConflictPanel.tsx` to embed `<ConflictDiff>` per path, drop the `Open externally` button and the `'external'` local-decision branch, and widen/heighten the modal to fit two columns of monospace text.
- Cleanup of `conflict-store.ts`: remove `openExternal` from `ConflictContextValue` and the provider's value object; drop the `openExternal` callback.
- Cleanup of `conflict-api.ts`: remove `requestOpenExternal` and its import in the store. The server route `POST /sync/conflict/open` is preserved per the main plan (non-goal to remove it).
- Add `diff` (jsdiff) to `apps/kanban-ui/package.json` `dependencies`.
- Update agent-browser scenarios under `apps/kanban-ui/agent-browser/m8/` so they no longer assert on the `Open externally` button and instead exercise the diff view.

**Out:**
- Per-hunk decisions, inline/unified mode, syntax highlighting, inline editing of merged result.
- Any sync-engine changes (Milestone 1 owns those).
- Removal of the `POST /sync/conflict/open` server route or the `'external'` value in `ResolveDecision` contract — both stay for backward compatibility.

## Constraints
- React 19, Vite 8, Tailwind v4 only — no new CSS framework, no new state library.
- All TS source files stay under 400 lines. Split helpers into a sibling module if `ConflictDiff.tsx` approaches the limit (e.g. extract the line-pairing/alignment function).
- `.js` extensions on all local ESM imports.
- No `any` types. Shared types come from `@awesome-markdown/contracts`.
- `ConflictDiff.tsx` must be pure-presentational (no store access, no fetches) and accept exactly the props named in the user request.

## Library Choice
Use [`diff`](https://github.com/kpdecker/jsdiff) (`diffLines`) as the recommended default: ~10 KB gzipped, zero deps, isomorphic, stable API, returns the change list needed to drive a line-pair alignment for the side-by-side view. A hand-rolled LCS would be ~50 lines but is not justified given the bundle cost is small and jsdiff handles edge cases (trailing newlines, EOL normalisation) the team would otherwise have to test. Add the dependency at the latest 7.x.

## Contracts (cross-component)
- `ConflictDiffProps` (new, internal): `{ oursLabel: string; theirsLabel: string; oursContent: string; theirsContent: string; oursTruncated: boolean; theirsTruncated: boolean }`. Consumed only by `ConflictPanel.tsx`.

## Implementation Notes (outcome-level)

1. **`ConflictDiff.tsx` (new)**
   - Run `diffLines(oursContent, theirsContent)` once via `useMemo` keyed on the four content/flag inputs.
   - Convert the change list into an array of aligned row pairs: equal chunks become N rows of `{ ours, theirs }` with both filled; a `removed` chunk paired with the immediately following `added` chunk produces row pairs (zip; pad shorter side with `null`); an unpaired `removed` produces rows with `theirs: null`; an unpaired `added` produces rows with `ours: null`.
   - Render two columns with sticky header showing `oursLabel` (left) / `theirsLabel` (right). Each row renders ours-cell and theirs-cell side by side. Cells: empty (no content present), neutral (equal), red-tinted (removed/null-theirs side), green-tinted (added/null-ours side). Per-side line numbers increment only on non-null cells.
   - Use a monospace font, `whitespace-pre`, and an outer container with `overflow-x-auto` so long lines scroll horizontally without breaking the column grid. Rows must keep ours/theirs visually aligned — implement with a CSS grid (`grid-cols-2`) or a flex row of two equal-width inner blocks; do not rely on table layout that collapses empty cells.
   - When `oursTruncated || theirsTruncated`, render a single banner above the diff naming which side(s) are truncated and the 16 KB cap.
   - Add `data-testid="conflict-diff-<sanitized-path>"` on the root, plus `data-testid="conflict-diff-truncated"` on the banner for scenario assertions. Path sanitisation must match the existing `replace(/\//g, '-')` convention used in `ConflictPanel`.

2. **`ConflictPanel.tsx` (rewrite)**
   - Drop `LocalDecisions` (replace with `Record<string, ResolveDecision>`) and the entire `'external'` branch (`statusLabel` cases, `handleOpenExternal`, the conditional informational paragraph, the `Open externally` button + its testid).
   - Remove `openExternal` from the `useConflict()` destructure.
   - For each `entry` in `activeConflict.paths`, render a card containing the path header, then `<ConflictDiff …={entry.{ours,theirs}{Content,Label,Truncated}} />`, then the `Use mine` / `Use remote` buttons. Keep existing testids for the two action buttons.
   - Widen the dialog to `max-w-6xl` (or `max-w-[90vw]`) and keep `max-h-[90vh]`; the cards list remains the scrollable region. Verify the modal still centres correctly on narrow viewports.
   - `canSubmit` simplifies to `paths.every(p => decisions[p.path] === 'ours' || decisions[p.path] === 'theirs') && !submitting`.

3. **`conflict-store.ts`**
   - Remove `openExternal` from `ConflictContextValue`, the provider's `value` object, and the `useCallback` definition.
   - Remove the `requestOpenExternal` import.
   - Run a workspace search for `openExternal` and `requestOpenExternal` and update or remove every consumer found (expected: only `ConflictPanel.tsx` and `conflict-store.ts` itself; flag any other hit before deleting).

4. **`conflict-api.ts`**
   - Remove the `requestOpenExternal` export. Do not delete the file or other helpers. The server endpoint stays.

5. **`apps/kanban-ui/package.json`**
   - Add `"diff": "^7.0.0"` to `dependencies`. If `@types/diff` is needed for the chosen version, add it to `devDependencies`; jsdiff 7 ships its own types — verify before adding.
   - Run `pnpm install` from repo root so the lockfile updates.

6. **agent-browser scenarios under `apps/kanban-ui/agent-browser/m8/`**
   - `scenario-open-external-pending.scenario.json` is now obsolete — delete it and remove any reference from `runner.mjs`.
   - `scenario-resolve-mixed.scenario.json` — drop any step that clicks `conflict-external-*` or asserts on `conflict-external-pending-*`. Replace with steps that assert `conflict-diff-*` is present for each path and that the modal still resolves cleanly via `Use mine` / `Use remote`.
   - Add one new scenario (or extend the mixed scenario) that calls the existing `POST /sync/conflict/inject` test hook with two-line ours and theirs payloads differing on one line, then asserts the diff modal shows: (a) both `oursLabel` and `theirsLabel` text in the sticky header, (b) at least one row tagged as removed and one as added (assert via the testid or distinguishable cell content). Match the assertion style already used by `runner.mjs` — do not introduce a new assertion framework.
   - If `runner.mjs` has a hard-coded scenario list, keep it in sync with the file changes.

## Definition of Done
- [ ] `pnpm typecheck && pnpm lint` clean for the whole workspace.
- [ ] `pnpm --filter kanban-ui verify:m8` passes against a running stack (sync-engine + provider-fs + ui).
- [ ] `ConflictPanel.tsx` and `ConflictDiff.tsx` each ≤ 400 lines.
- [ ] No source file in `apps/kanban-ui/src` references `openExternal`, `requestOpenExternal`, `'external'` as a `ResolveDecision`-narrow value, or the `conflict-external-*` testid.
- [ ] Manual e2e: with the seeded conflict (`content/item-fix-auth-bug.md` local `todo` vs origin `done`), the modal renders a side-by-side diff with the `status:` line shown red on the left and green on the right, and `Resolve conflicts` completes with `synced`.
- [ ] Truncation banner appears when either content side reports truncated (verify by injecting a > 16 KB file via the inject hook).

## Risks & Decisions To Get Right
- **Row alignment, not column-independent lists.** The two columns must scroll vertically as one unit so an ours line and its corresponding theirs line stay on the same row. Implement as one row container per pair, not two independently scrolling lists.
- **Long lines.** Use `overflow-x-auto` on the outer card and `whitespace-pre` (not `pre-wrap`) on cells so wrapping does not break row alignment.
- **`'external'` stays in the contract.** Do not edit `packages/contracts/src/conflict.ts` to narrow `ResolveDecision`; the server still accepts/returns it. Only the UI's local state narrows.
- **Bundle size.** Confirm `diff` is tree-shaken — import `{ diffLines }` from `diff`, not the default.
- **Truncated content correctness.** When truncated, the diff is computed on the truncated text only; that is acceptable. Make sure the banner makes this obvious to the user so they don't read the diff as exhaustive.

## Open Questions
- None. The library choice is decided (jsdiff); all other decisions are inferable from the main plan and existing code.
