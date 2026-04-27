# awesome-markdown — Main Plan

Greenfield, lightweight, git-backed kanban system. Pure client-side UI, pluggable
providers behind a shared contract, decoupled sync-engine. Lessons from
`awesome-markdown-tmp.md` apply, but every layer is leaner and less coupled.

## 1. Goal & Success Criteria

**Goal:** Ship a new `awesome-markdown` monorepo containing a React kanban UI, two
interchangeable persistence providers (browser localStorage and local-fs markdown
sidecar), and an independent sync-engine that handles git and external-change
notifications.

**Success Criteria (observable):**

- A user can open `kanban-ui` in a browser, pick a provider at runtime, and CRUD
  items with drag-and-drop across columns and swimlanes.
- The localStorage provider runs entirely in-browser; no server required.
- The local-fs provider runs as a Node sidecar exposing the provider contract over
  HTTP/SSE, persisting items as markdown files with YAML frontmatter (shape per
  `awesome-markdown-content-tmp.md`).
- The sync-engine runs as a separate process: watches `content/`, auto-commits
  changes to git, pulls/pushes the remote, and pushes external-change events to
  `kanban-ui` over SSE.
- `kanban-ui` remains fully usable when the sync-engine is offline; it reconciles
  on reconnect.
- Conflict events emitted by the sync-engine surface a resolution UI in
  `kanban-ui`; the user can choose ours / theirs / open externally.
- End-to-end TypeScript type safety: schemas defined once in `packages/contracts`,
  consumed by every component without duplication.
- `pnpm typecheck && pnpm lint` pass at the workspace root.
- Every milestone that produces **UI-observable behavior** is verified working
  via `agent-browser`: an automated browser-driving agent loads `kanban-ui`,
  exercises the milestone's use cases end-to-end, and confirms observable
  outcomes (DOM state, user-visible feedback) match the acceptance criteria.
  Non-UI milestones (provider sidecar API, sync-engine internals) are
  verified by their own unit/integration tests, **not** by `agent-browser`.

## 2. Non-Goals

- No central REST API in front of providers. UI talks directly to the chosen
  provider.
- No database. Storage is localStorage or markdown files only.
- No auth, multi-user collaboration, or real-time co-editing.
- No production deployment topology in this plan (local dev only).
- No mobile-specific UI work.
- No automated three-way merge. Conflicts are surfaced; resolution is user-driven.

## 3. Tech Stack & References

| Layer | Choice |
|-------|--------|
| Monorepo | pnpm workspaces (no Turborepo) |
| Language | TypeScript 5.x, ES2022 |
| Validation | Zod v4 |
| UI | React 19, Vite 8 (Rolldown + Oxc), Tailwind v4, @dnd-kit |
| Sidecar / sync-engine | Fastify v5 + `fastify-type-provider-zod` |
| File watching | chokidar |
| Git | simple-git |
| Markdown frontmatter | gray-matter |
| Live channel | Native SSE (no WebSocket) |
| Lint / format | oxc flat config, Prettier |
| UI E2E verification | `agent-browser` (LLM-driven browser automation, UI only) |
| Non-UI tests | Vitest (unit + integration) for sidecar and sync-engine |

**Zod v4:** Use `zod@^4.0.0` throughout. Import from `"zod"` (no sub-path imports
needed in v4). Prefer `z.object`, `z.string`, `z.union`, etc. — API is unchanged
from v3 for most common usage; check migration guide for `.parse` / `.safeParse`
edge cases.

References (must be re-fetched at implementation time for current syntax):

- React 19 — https://react.dev/blog/2024/12/05/react-19
- Vite 8 — https://vite.dev/guide/
- Vite 8 migration guide — https://vite.dev/guide/migration
- Rolldown — https://rolldown.rs/
- Oxc — https://oxc.rs/
- Tailwind v4 — https://tailwindcss.com/docs/installation
- @dnd-kit — https://docs.dndkit.com/
- Fastify v5 — https://fastify.dev/docs/latest/
- `fastify-type-provider-zod` — https://github.com/turkerdev/fastify-type-provider-zod
- chokidar — https://github.com/paulmillr/chokidar
- simple-git — https://github.com/steveukx/git-js
- gray-matter — https://github.com/jonschlinkert/gray-matter
- pnpm workspaces — https://pnpm.io/workspaces
- Zod v4 — https://zod.dev/

## 4. Milestones

| #  | Name                                             | Cx | Un | Wk | Depends-On | Plan |
|----|--------------------------------------------------|----|----|----|------------|------|
| M1 | Monorepo bootstrap & shared contracts            | 2  | 2  | 2  | —          | inline |
| M2 | Provider interface + localStorage provider       | 2  | 1  | 2  | M1         | inline |
| M3 | kanban-ui MVP (board, columns, swimlanes, DnD)   | 4  | 3  | 4  | M2         | file |
| M4 | local-fs provider sidecar                        | 4  | 3  | 4  | M1         | file |
| M5 | HTTP/SSE provider client + runtime selection     | 3  | 2  | 2  | M3, M4     | file |
| M6 | Sync-engine: file watch + auto-commit + SSE      | 4  | 3  | 3  | M4         | file |
| M7 | Sync-engine: remote pull/push + offline tolerance| 4  | 4  | 3  | M6         | file |
| M8 | Conflict detection + mitigation flow             | 5  | 4  | 4  | M7, M3     | file |
| M9 | Multi-board / board switcher                     | 2  | 2  | 2  | M3         | inline |
| M10| Documentation & conventions                      | 2  | 1  | 2  | M1–M9      | inline |

Milestones with `file` get a dedicated `awesome-markdown-m{N}.md` from
`Planner.Milestone`. Inline milestones execute from this main plan.

### Inline milestone descriptions

**M1 — Monorepo bootstrap & shared contracts**
- Add pnpm workspace, root `package.json`, `pnpm-workspace.yaml`,
  `tsconfig.base.json`, oxc flat config, Prettier, `.gitignore`,
  `.editorconfig`, MIT LICENSE.
- Create `packages/contracts/` with: domain schemas (Item, Column, Swimlane,
  Board), provider interface (TS), sync-engine event union (`change`, `conflict`,
  `synced`, `offline`), DTOs for HTTP/SSE wire format. All Zod v4. Export inferred
  types only.

**M2 — Provider interface + localStorage provider**
- Define `PersistenceProvider` interface in `packages/contracts`: async CRUD over
  Items, Columns, Swimlanes, Boards; `subscribe(handler)` returning
  `Unsubscribe`; `capabilities` discriminator.
- Create `packages/provider-localstorage/` implementing the interface in-browser.
  Persist a single namespaced JSON blob; emit local subscribe events.
- Add a Vitest unit-test suite covering CRUD round-trip and subscription fan-out.

**M9 — Multi-board / board switcher**
- Extend UI route table: `/` lists boards, `/boards/:slug` opens a board.
- Use existing provider methods; no contract change.
- **UI verification (agent-browser):** scenario lists ≥2 boards, navigates
  into one via click, deep-links `/boards/:slug` directly, asserts board
  content isolation between boards.

**M10 — Documentation & conventions**
- Author root `README.md`, `docs/ARCHITECTURE.md` (component diagram, data flow,
  conflict flow), `apps/*/README.md`, `packages/*/README.md`.
- Author `.github/copilot-instructions.md` describing layout, tech stack,
  conventions, dev commands, ports, file-size limits.

## 5. Use Cases

**UC-1 — User edits via kanban-ui, sync-engine online, fs provider**
- Pre: ui connected to fs sidecar; sync-engine running; clean git tree.
- Flow: user drags item to new column → ui calls provider HTTP → sidecar writes
  markdown → sync-engine watcher fires → auto-commit → push to remote → emits
  `synced` over SSE → ui shows synced indicator.
- Error: push fails (no network) → sync-engine emits `offline`; commit retained
  locally.

**UC-2 — User edits via kanban-ui, sync-engine offline, fs provider**
- Pre: sync-engine process not running.
- Flow: ui writes through provider; markdown updated; ui reflects change.
- On sync-engine reconnect: watcher detects unstaged files → commits batch →
  emits `synced`.

**UC-3 — User edits a markdown file in Notepad while ui is open**
- Pre: ui open, fs provider, sync-engine online.
- Flow: file save → watcher fires → sync-engine commits → emits `change` SSE
  event with file path → ui receives event → re-fetches affected entity from
  provider → board re-renders.

**UC-4 — Remote change pushed via GitHub web editor**
- Flow: sync-engine periodic `git pull` (or webhook trigger) → fast-forward
  succeeds → emits `change` per modified file → ui re-fetches.
- Conflict path: pull produces merge conflict → sync-engine emits `conflict`
  event with file path + diff hunks → ui shows resolution UI → user picks
  ours / theirs / open externally → sync-engine completes merge.

**UC-5 — User edits via kanban-ui with localStorage provider**
- Pre: ui only; no sidecar; no sync-engine.
- Flow: writes go to `localStorage`; subscribers fire in-process. No git, no
  network. Used as zero-setup default.

**UC-6 — Provider switch at runtime**
- Pre: ui open with localStorage provider.
- Flow: user opens settings → picks "Local FS sidecar" + URL → ui rebinds
  provider, reloads board state, reconnects SSE.

## 6. Acceptance Criteria

- AC-1: `pnpm install && pnpm typecheck && pnpm lint` succeed at repo root.
- AC-2: Starting `kanban-ui` alone (no sidecar) yields a working board on
  localStorage provider.
- AC-3: Starting fs sidecar + ui yields a working board persisting to
  `content/` with markdown shape matching `awesome-markdown-content-tmp.md`.
- AC-4: Editing a markdown file in an external editor causes the open ui to
  refresh affected items within 2 seconds (sync-engine running).
- AC-5: Killing the sync-engine does not break the ui or sidecar; resuming it
  commits any pending changes.
- AC-6: A simulated git conflict (modify same field locally + remotely, then
  pull) raises a conflict event in the ui with a resolvable UI.
- AC-7: No `any` in `packages/contracts`; every cross-package call is typed via
  contract exports.
- AC-8: Each TS source file ≤ 400 lines; each `SKILL.md` / instruction file ≤
  600 words.
- AC-9: `agent-browser` UI verification runs exist and pass for every
  milestone with UI-observable behavior (M3, M5, M8, M9). Each run is
  reproducible from a documented command and a saved scenario script.
- AC-10: A combined `agent-browser` UI smoke suite covers the user-visible
  paths of UC-1, UC-3, UC-4, UC-5, UC-6 against a fully wired stack
  (ui + fs sidecar + sync-engine) and is invocable via a single root script
  (e.g. `pnpm verify:ui`).
- AC-11: Sidecar (M4) and sync-engine (M6, M7) ship Vitest suites covering
  their HTTP/SSE endpoints, watcher behavior, and git operations against a
  temp repo. These run in CI without a browser.

## 6a. Verification via agent-browser (UI only)

`agent-browser` is the canonical **UI** verifier. It drives the running
`kanban-ui` in a real browser and asserts user-visible outcomes. It is
**only** used for UI verification. Non-UI components (fs sidecar, sync-engine)
are verified by Vitest suites that run without a browser.

**Per-milestone obligations (UI milestones only):**

- Each UI milestone owns a scenario directory:
  `apps/kanban-ui/agent-browser/m{N}/`, one scenario per use case.
- Each scenario specifies: required services to start, UI preconditions
  (seed state via provider), the user actions to drive, and the DOM-level
  assertions to verify.
- Milestone-level command: `pnpm --filter kanban-ui verify:m{N}`.

**Coverage matrix (UI only):**

| Milestone | UI behavior verified | Use cases (UI surface) |
|-----------|----------------------|------------------------|
| M3  | board renders; DnD across columns and swimlanes; CRUD via UI | UC-5 |
| M5  | runtime provider switch via settings; SSE indicator updates | UC-6 |
| M8  | conflict banner appears on conflict event; resolution UI flow (ours/theirs/open) returns board to clean state | UC-4 (UI surface) |
| M9  | board list page; navigation; deep-link `/boards/:slug` | (board switcher) |

**Non-UI verification (no agent-browser):**

| Milestone | Verifier | Scope |
|-----------|----------|-------|
| M4 (fs sidecar)        | Vitest + fastify inject | HTTP/SSE provider contract against a temp `content/` dir |
| M6 (watcher + commit)  | Vitest + temp git repo  | chokidar events → simple-git commits → SSE emission |
| M7 (remote pull/push)  | Vitest + local bare repo as remote | fetch/pull/push, offline retry, fast-forward |

**Aggregate UI suite:** `pnpm verify:ui` at the repo root starts the full
stack (ui + fs sidecar + sync-engine pointed at a local bare git remote) and
runs the M3/M5/M8/M9 scenarios as a smoke pass. UC-1, UC-3 UI surfaces are
exercised inside M8 setup (edits propagate to UI). UC-2 has no UI-only
assertion beyond M3 (offline behavior is covered by sync-engine tests).

**Definition of "verified working":** for UI milestones, a green
`agent-browser` run on a clean checkout. For non-UI milestones, a green
Vitest run on a clean checkout. No manual steps.

## 7. Rollout / Backward-Compat Strategy

- Greenfield repo. No backward-compat constraints.
- Reference content (`awesome-markdown-content-tmp.md`) defines the markdown
  schema baseline; any change must update the Zod schema, the example file,
  and the ARCHITECTURE doc together.
- Components are versioned via the monorepo as a single unit at MVP. Public
  package versioning is deferred.

## 8. Documentation Impact

| Target | Reason | Owning Milestone |
|--------|--------|------------------|
| New `awesome-markdown/README.md` | Project overview, setup, dev commands | M10 |
| New `awesome-markdown/docs/ARCHITECTURE.md` | Component diagram, data flow, conflict flow, provider contract | M10 |
| New `awesome-markdown/apps/kanban-ui/README.md` | UI dev/run/build, provider selection | M3 |
| New `awesome-markdown/apps/provider-fs/README.md` | Sidecar config, ports, env | M4 |
| New `awesome-markdown/apps/sync-engine/README.md` | Watcher, git auth, SSE channel, conflict events | M6 |
| New `awesome-markdown/packages/contracts/README.md` | Schema and contract reference | M1 |
| New `awesome-markdown/.github/copilot-instructions.md` | Repo conventions, ports, commands | M10 |
| New `awesome-markdown/docs/VERIFICATION.md` | `agent-browser` UI scenarios, Vitest non-UI suites, how to run per-milestone and aggregate `pnpm verify:ui` | M10 |

## 9. Resolved Decisions

- **Git remote auth (M7):** Use a GitHub Fine-Grained Personal Access Token (PAT).
  Configure via env var `GITHUB_TOKEN`. simple-git uses it via HTTPS remote URL
  (`https://<token>@github.com/...`). Scoped to the `awesome-markdown` repo with
  `Contents: read/write` and `Metadata: read` permissions.
