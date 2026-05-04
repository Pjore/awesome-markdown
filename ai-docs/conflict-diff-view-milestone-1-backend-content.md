# Milestone 1: Expose ours/theirs content from sync-engine

## Metadata
- Parent plan: `conflict-diff-view-main.md`
- Complexity: 3 / Work: 2
- Depends on: none (extends current M8 conflict pipeline)
- Use cases: UC-1 (server side), UC-2 (no behavior change)

## Objective
Extend the conflict contract and the sync-engine session pipeline so that `GET /sync/conflict/state` returns the full ours-side and theirs-side text for each conflicting path, with truncation flags. After this milestone the kanban-ui has all data it needs to render a side-by-side diff; the UI itself is unchanged.

## Scope

**In:**
- Extend `ConflictPathEntry` with `oursContent`, `theirsContent`, `oursTruncated`, `theirsTruncated` (all non-optional).
- New module under `apps/sync-engine/src/conflict/` that extracts ours/theirs text from the active merge using git index stages, with a 16 KB per-side cap.
- `ConflictSessionManager` stores per-path content and emits it through `toConflictState()`.
- `remote-worker.ts` populates content on real merge conflicts before creating the session.
- `inject.ts` populates content on injected conflicts.
- Sync-engine Vitest coverage for content presence, truncation, and the inject path.

**Out:**
- Any UI work in `apps/kanban-ui` (milestone 2).
- Changes to `POST /sync/conflict/resolve`, `/open`, or the `conflict` SSE event payload.
- New endpoints, schema migrations, or persistence — sessions remain in-memory only.
- Refactoring `conflict-detector.ts` beyond importing/sharing the size cap if convenient.

## Constraints
- No `any` in `packages/contracts`.
- Reuse the existing 16 KB convention (`MAX_HUNK_BYTES` in `conflict-detector.ts`); duplicate the constant locally in the new extractor or export it — pick whichever keeps both files under 400 lines.
- `ConflictPathEntry` stays a TS-only interface (no Zod schema today); do not introduce one.
- Local ESM imports use `.js` extensions.
- Truncation rule: cap by UTF-8 byte length using `Buffer.byteLength` (consistent with `conflict-detector.ts`); when truncated, slice the string to the cap and set the flag. Do not append a truncation marker to the content itself — the UI renders the indicator from the flag.
- Missing git stages (e.g., add/add or delete/modify edge cases) yield empty string and `truncated: false`; the extractor never throws on a per-path read failure — log and continue.

## Contracts
- `ConflictPathEntry` (extended): adds four required fields — `oursContent: string`, `theirsContent: string`, `oursTruncated: boolean`, `theirsTruncated: boolean`. Provider: sync-engine `GET /sync/conflict/state`. Consumers: kanban-ui (milestone 2) and existing sync-engine tests.
- Internal: `ConflictSessionManager.create(...)` accepts a new `content` map keyed by repo-relative path; consumed only inside sync-engine.

## Implementation Outline (file-level, no code)

1. **`packages/contracts/src/conflict.ts`** — add the four fields to `ConflictPathEntry`. No other shape changes. `index.ts` already re-exports the type, so no edit there.

2. **`apps/sync-engine/src/conflict/content-extractor.ts`** (new) — exports a single async function that takes `{ repoRoot, paths }` and returns `Record<path, { ours, theirs, oursTruncated, theirsTruncated }>`. Uses `simpleGit({ baseDir: repoRoot })` and `git.raw(['show', ':2:<path>'])` / `:3:<path>`. Wrap each read in try/catch — on failure return empty string + `truncated: false` for that side. Apply the 16 KB byte cap per side before returning.

3. **`apps/sync-engine/src/conflict/session.ts`** —
   - Add `content: Record<string, { ours: string; theirs: string; oursTruncated: boolean; theirsTruncated: boolean }>` to `ConflictSessionData`.
   - Extend `create(...)` params with a required `content` field; store it on the session. Default to an empty object only when callers cannot provide content (avoid silent fallbacks — both call sites must pass it).
   - Update `toConflictState()` to read from the stored content map and populate the four new fields per entry. If a path has no content entry (defensive), emit empty strings + `false` flags.

4. **`apps/sync-engine/src/remote-worker.ts`** — locate the existing `sessionManager.create(...)` call on the real-merge conflict path. Immediately before it, await the new extractor with the conflicted paths and pass the result through. Do not change ordering of the SSE `conflict` broadcast or any pull/merge logic.

5. **`apps/sync-engine/src/conflict/inject.ts`** — after the real merge has produced index conflicts (the existing `git merge tmpBranch` flow does create stages 2/3 in the index), call the same extractor used by `remote-worker.ts` and pass the result into `sessionManager.create(...)`. **Do not** read from `req.oursContent`/`req.theirsContent` — using the extractor keeps inject and real merges on one code path. If verification shows stages 2/3 are not present after `git merge` in the inject flow, fall back to applying the cap to `req.oursContent[path]` / `req.theirsContent[path]` directly; document the chosen path in a one-line comment in `inject.ts`.

6. **Tests** in `apps/sync-engine/test/`:
   - Extend `conflict-resolve.test.ts` (or `conflict-detection.test.ts`, whichever currently asserts on `/sync/conflict/state`) to assert that each `paths[]` entry includes non-empty `oursContent`/`theirsContent` strings and `false` truncation flags for typical small fixtures.
   - Extend `conflict-inject.test.ts` to inject content larger than 16 KB on at least one side and assert `oursTruncated` / `theirsTruncated` is `true` and the returned content length ≤ 16 KB.
   - No need to add a unit test for the extractor in isolation if the integration tests cover both sides and truncation; add one only if integration coverage leaves a gap.

## Definition of Done
- [ ] `ConflictPathEntry` carries the four new fields and contracts package builds.
- [ ] `GET /sync/conflict/state` returns populated content + flags on real merge conflicts and on injected conflicts.
- [ ] Truncation flag is set when either side exceeds 16 KB; returned content respects the cap.
- [ ] All `apps/sync-engine/test/conflict-*.test.ts` suites green, including new assertions.
- [ ] `pnpm typecheck && pnpm lint && pnpm --filter sync-engine test` clean from repo root.
- [ ] All touched TS files remain under 400 lines.

## Risks & Decisions To Get Right
- **Single source of truth for content extraction.** Use the new extractor from both `remote-worker.ts` and `inject.ts`. Resist re-implementing per-call site.
- **Required vs optional fields.** Fields are required in the contract; ensure both call sites populate `content` so `toConflictState()` never has to invent values.
- **Truncation by bytes, not characters.** UTF-8 byte length matches `conflict-detector.ts` and HTTP payload bounds; slicing by `string.slice(0, N_bytes)` is acceptable since the cap is on bytes pre-slice — verify the byte length post-slice in tests if needed, or slice via `Buffer` to be exact.
- **Inject flow stage availability.** The existing inject performs a real `git merge`, so stages 2/3 should be populated. Verify before choosing the fallback in step 5.

## Open Questions
- None blocking. If the inject flow turns out to lack proper index stages, fall back to the request body as noted in step 5 and proceed.
