# Implementation Plan: conflict-diff-view

## 0. Metadata
- **Complexity:** 3
- **Uncertainty:** 2
- **Work:** 2
- **Scope:** Replace the path-list-only conflict modal with a VS Code-style side-by-side diff view (ours vs theirs) and drop the "Open externally" action. Sync-engine must expose the ours/theirs content for each conflicting path.
- **Non-goals:**
  - Per-hunk decisions (user confirmed: whole-file decision is retained)
  - Inline/unified diff mode (side-by-side only)
  - Syntax highlighting beyond plain monospace + add/remove line coloring
  - Editing the merged result inline (decision is still ours-or-theirs only)
  - Removing or refactoring the existing `POST /sync/conflict/open` endpoint (it stays in place but the UI no longer calls it)

## 1. Problem Statement
The current conflict resolution modal in `apps/kanban-ui/src/components/ConflictPanel.tsx` lists conflicting file paths and three buttons (`Use mine` / `Use remote` / `Open externally`) but shows no content, forcing the user to pick blindly or open an external editor. Users need to see the actual differences between their local change and the incoming remote change inside the web UI before choosing a side.

## 2. Constraints & Assumptions
- The active conflict session model in `apps/sync-engine/src/conflict/session.ts` (single in-flight merge, in-memory only) is preserved.
- `ResolveDecision` retains values `'ours' | 'theirs' | 'external'` in `packages/contracts/src/conflict.ts` for backward compatibility with `POST /sync/conflict/resolve`, even though the UI no longer surfaces `external`.
- File contents for the two sides are obtained from the git index after the merge produced conflict markers: stage 2 (`:2:<path>`) is ours, stage 3 (`:3:<path>`) is theirs. This is how `apps/sync-engine/src/conflict-detector.ts` already operates against git.
- Content is markdown text only; no binary handling required.
- Per-path content size is capped (reuse the existing 16 KB hunk cap convention from `conflict-detector.ts`) to bound HTTP payload.
- The kanban-ui pulls full content via `GET /sync/conflict/state` — no new SSE event shape.
- The diff library used in the UI must be isomorphic-safe (no Node deps) and small. Candidate: `diff` (Myers line diff, ~10 KB gzipped) — final selection deferred to milestone 2.
- Tailwind v4 is the styling system; no new CSS framework introduced.

## 3. Target State (Definition of Done)

**Functional:**
- `GET /sync/conflict/state` returns, for each conflicting path, the full ours-side text and theirs-side text alongside the existing labels.
- Opening the conflict modal shows, for each path, a side-by-side diff: ours on the left, theirs on the right, with added/removed lines visually distinguished.
- Each path has exactly two buttons: `Use mine` (ours) and `Use remote` (theirs). The `Open externally` button is removed from the UI.
- Submitting the modal continues to call `POST /sync/conflict/resolve` with the chosen decisions; sync-engine completion path is unchanged.
- `injectConflict` test hook continues to seed sessions whose state response now includes content.

**Non-functional:**
- Per-path content payload capped at 16 KB; truncation indicated to the user.
- No regressions in existing conflict round-trip (banner appears, resolve completes, `synced` clears state).

**Success Criteria:**
- [ ] `pnpm --filter @awesome-markdown/contracts test` passes with new schema.
- [ ] `pnpm --filter sync-engine test` passes with updated session/state tests covering ours/theirs content.
- [ ] `pnpm --filter kanban-ui verify:m8` (or equivalent agent-browser scenarios under `apps/kanban-ui/agent-browser/m8/`) passes against the new modal.
- [ ] Manual reproduction: with the current local edit on `content/item-fix-auth-bug.md` (status `todo`) vs origin/main (status `done`), pulling produces a conflict whose modal shows the two `status:` lines diffed side-by-side.
- [ ] `pnpm typecheck && pnpm lint` clean.
- [ ] No TS source file exceeds 400 lines.

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `packages/contracts/src/conflict.ts` | Modify | Extend `ConflictPathEntry` with `oursContent: string`, `theirsContent: string`, `oursTruncated: boolean`, `theirsTruncated: boolean`. |
| `apps/sync-engine/src/conflict/session.ts` | Modify | Persist per-path ours/theirs content snapshots on session creation; expose via `toConflictState()`. |
| `apps/sync-engine/src/conflict/content-extractor.ts` | New | Read stage-2 / stage-3 blobs from the git index for the active merge and apply the size cap. |
| `apps/sync-engine/src/remote-worker.ts` | Modify | Call the content extractor before `sessionManager.create(...)` and pass content into the session. |
| `apps/sync-engine/src/conflict/inject.ts` | Modify | Pass `oursContent` and `theirsContent` (already in `InjectConflictRequest`) into the session at creation time. |
| `apps/sync-engine/test/` | Modify | Update conflict resolve / state tests to cover content fields and truncation. |
| `apps/kanban-ui/src/components/ConflictPanel.tsx` | Modify | Replace path list with a per-path side-by-side diff view. Remove `Open externally` button and the local `external` state. |
| `apps/kanban-ui/src/components/ConflictDiff.tsx` | New | Pure presentational component that renders a side-by-side line diff for a single path. |
| `apps/kanban-ui/src/sync/conflict-store.ts` | Modify | Drop `openExternal` from the context (no consumer remains) or keep it unused — final call in milestone 2. |
| `apps/kanban-ui/package.json` | Modify | Add the chosen diff library dependency. |
| `apps/kanban-ui/agent-browser/m8/*` | Modify | Update scenarios that asserted on the old "Open externally" button or path-only layout. |

## 5. Use Cases

### UC-1: View ours/theirs differences for a conflicting item
**Actor:** kanban-ui user with an active merge conflict
**Trigger:** User clicks `Resolve` in the conflict banner
**Flow:**
1. UI fetches `GET /sync/conflict/state`.
2. Sync-engine returns the `ConflictState` including ours/theirs content per path.
3. UI renders the modal with one card per path; each card shows a side-by-side line diff (ours on the left, theirs on the right).
4. User scrolls/reads the diff.

**Input:** none beyond the existing `mergeId` in session.
**Output:** Visible diff with added/removed lines highlighted.
**Errors:**
- Session no longer active → modal closes with the existing `synced` flow.
- Content truncated → diff card shows a "truncated" indicator.

### UC-2: Choose ours or theirs from the diff modal
**Actor:** kanban-ui user
**Trigger:** User clicks `Use mine` or `Use remote` for each conflicting path in the modal, then `Resolve conflicts`.
**Flow:**
1. UI captures one decision per path (`'ours'` or `'theirs'`).
2. UI calls `POST /sync/conflict/resolve` with `{ mergeId, decisions }`.
3. Sync-engine applies decisions, completes merge, pushes, emits `synced`.
4. UI receives `synced`, clears conflict state, closes modal.

**Input:** `{ mergeId: string, decisions: Record<path, 'ours' | 'theirs'> }`
**Output:** `ResolveResponse` with `status: 'completed'` and empty `remainingPaths`.
**Errors:** unchanged from current behavior (`409 NO_ACTIVE_SESSION`, `400 UNKNOWN_PATHS`, `500 GIT_FAILURE`).

### Contracts

**Contract: ConflictPathEntry (extended)**
- **Provider:** sync-engine (`GET /sync/conflict/state`)
- **Consumer:** kanban-ui (`apps/kanban-ui/src/sync/conflict-store.ts`, `ConflictPanel.tsx`, `ConflictDiff.tsx`)
- **Shape:**
  - `path: string` — repo-relative
  - `oursLabel: string` — existing
  - `theirsLabel: string` — existing
  - `decision: ResolveDecision | null` — existing
  - `oursContent: string` — full ours-side text (UTF-8), capped at 16 KB
  - `theirsContent: string` — full theirs-side text (UTF-8), capped at 16 KB
  - `oursTruncated: boolean`
  - `theirsTruncated: boolean`

## 6. Milestones

### Milestone 1: Expose ours/theirs content from sync-engine
**Objective:** Extend the conflict contract and sync-engine session/state pipeline to carry per-path ours and theirs file contents through `GET /sync/conflict/state`.

**Deliverables:**
- Updated `ConflictPathEntry` with content + truncation fields in `packages/contracts`.
- New content-extractor module that reads stage 2 and stage 3 from the git index with a 16 KB cap.
- `ConflictSessionManager.create(...)` accepts and stores ours/theirs content; `toConflictState()` emits it.
- `remote-worker.ts` and `inject.ts` populate content on session creation.
- Updated sync-engine Vitest suite covering content presence and truncation.

**Use Cases:** UC-1 (server side), UC-2 (no behavior change).

**Complexity:** 3 | **Work:** 2

---

### Milestone 2: Side-by-side diff modal in kanban-ui
**Objective:** Replace the current path-list layout in `ConflictPanel.tsx` with a VS Code-style side-by-side diff per path; remove the `Open externally` action.

**Deliverables:**
- New `ConflictDiff.tsx` component rendering side-by-side line diff with add/remove styling and a truncation banner.
- `ConflictPanel.tsx` rewritten to embed `ConflictDiff` per path; only `Use mine` / `Use remote` buttons remain.
- `conflict-store.ts` cleaned up: `openExternal` removed from context value (or marked unused) and no longer wired in panels.
- Diff library dependency added in `apps/kanban-ui/package.json`.
- Updated agent-browser scenarios under `apps/kanban-ui/agent-browser/m8/` to assert on the diff view and the absence of the `Open externally` button.

**Use Cases:** UC-1 (client side), UC-2 (client side).

**Complexity:** 3 | **Work:** 2

---

**Review Checkpoint:** After creating this main plan, pause for user review before generating detailed milestone files.

## 7. Validation & Verification
- Vitest suites in `apps/sync-engine/test/` and `packages/contracts/test/` updated to cover the new content fields and truncation flag.
- Agent-browser scenarios under `apps/kanban-ui/agent-browser/m8/` updated to drive the diff modal end-to-end.
- Manual e2e using the existing in-tree conflict (`content/item-fix-auth-bug.md` local `todo` vs origin `done`): start sync-engine, trigger a pull, confirm modal renders side-by-side diff and resolves to `synced`.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm verify:ui`.

## 8. Rollback Strategy
- All changes are additive at the contract level (new optional-shaped fields if introduced as optional during rollout). Reverting milestone 2 alone restores the old modal while leaving the richer state response in place — harmless.
- Reverting milestone 1 requires reverting milestone 2 too (UI would otherwise expect content fields).
- No persistent state migrations: conflict sessions are in-memory only.

## 9. Open Questions
- Diff library choice: `diff` (jsdiff) vs `@codemirror/merge` vs hand-rolled LCS. To be resolved in milestone 2 with a constraint of small bundle size and no Node deps.
- Should the modal show a 3-way view (base + ours + theirs) instead of 2-way? Out of scope for this plan unless the user requests it; current proposal is 2-way only.

## 10. References
- VS Code diff editor concept: https://code.visualstudio.com/docs/sourcecontrol/overview#_diff-editor
- Git index stages (`:2:` ours, `:3:` theirs): https://git-scm.com/docs/git-checkout#Documentation/git-checkout.txt---ours
- `diff` (jsdiff) library: https://github.com/kpdecker/jsdiff
