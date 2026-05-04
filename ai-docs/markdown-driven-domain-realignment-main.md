# Implementation Plan: markdown-driven-domain-realignment

## 0. Metadata
- **Complexity:** 5
- **Uncertainty:** 3
- **Work:** 5
- **Scope:** Realign Zod schemas, YAML taxonomy files, and item markdown files into a single markdown-driven model. Items become portable, self-describing first-class data; boards/columns/swimlanes become an optional cosmetic-and-rules layer. Storage becomes a flat directory of typed `.md` files.
- **Non-goals:**
  - Adding new kanban features beyond what is required to support the new model
  - Changing transport (HTTP+SSE stays), git auth, or sync-engine architecture
  - Adding a database, cache, or index file (the repo content remains the only source of truth)
  - Multi-user real-time collaboration semantics beyond current SSE behavior

## 1. Problem Statement
The current model maintains three parallel representations — Zod schemas in [packages/contracts/src/schemas](packages/contracts/src/schemas/), YAML taxonomy files ([content/boards/board-demo/columns.yaml](content/boards/board-demo/columns.yaml), [content/boards/board-demo/swimlanes.yaml](content/boards/board-demo/swimlanes.yaml), [content/boards/board-demo/board.yaml](content/boards/board-demo/board.yaml)), and item markdown files with frontmatter ([content/boards/board-demo/items/](content/boards/board-demo/items/)) — each maintained independently and prone to drift. Items are not portable across boards, taxonomy edits create silent orphans, opaque IDs (`col-todo`, `item-001`) fight git rename history, and escape hatches like `customFields._order` reveal model gaps. The system is not markdown-driven: YAML defines the taxonomy and items must conform, instead of items being self-sufficient and the taxonomy being optional decoration.

## 2. Constraints & Assumptions
- Markdown is the source of truth; every entity is a `.md` file with YAML frontmatter
- Storage is a flat directory of `.md` files; folder structure and filenames carry no semantic meaning beyond `<slug>.md`
- Frontmatter `type` field discriminates entity kind (`item`, `board`, `column`, `swimlane`, future kinds)
- Items are portable and may appear on multiple boards with independent column/swimlane/order per board
- Per-board placement is owned by the **item's** frontmatter (chosen for self-sufficiency); the board file does not enumerate items
- Item schema is **strict** (data); board/column/swimlane schemas are **lenient with passthrough** (cosmetic + rules)
- Identifiers are **slugs only**; file name = `<slug>.md`; renames are supported via an `aliases: [old-slug]` field
- Items must render even when referenced columns or swimlanes have no definition file (slug used as friendly name; no rules applied)
- All packages must continue to compile under TypeScript strict mode and pass `pnpm typecheck && pnpm lint`
- Existing demo content in [content/boards/board-demo/](content/boards/board-demo/) must be migrated; no live user content exists yet so a one-shot migration is acceptable
- Git history preservation is a goal, not a requirement; `git mv` is preferred over delete+create where practical

## 3. Target State (Definition of Done)

**Functional:**
- Every persisted entity is an `.md` file with frontmatter discriminated by `type`
- An item can declare placements on N boards via a `boards` list in its frontmatter
- The kanban UI renders a board even if some referenced columns/swimlanes have no definition (degraded mode using the slug as label)
- Renaming a column slug and adding the old slug to its `aliases` list does not break items still referencing the old slug
- Hand-editing a single `.md` file in a text editor never invalidates other files; a malformed single file is reported and isolated, the rest of the board still loads
- Demo content is fully migrated and the existing UI flows (view, create, edit, move, delete item; create/edit column/swimlane) work end-to-end

**Non-functional:**
- No file contains a list that all concurrent edits must touch (no central `columns.yaml` write contention)
- Single Zod source of truth in `@awesome-markdown/contracts` is the only definition of frontmatter shapes; provider-fs and kanban-ui import types from it
- Adding a new optional frontmatter field requires no migration script; old files parse forward
- All cross-entity references (column slug, swimlane slug, board slug, alias) resolve through one shared resolver module

**Success Criteria:**
- [ ] `pnpm typecheck && pnpm lint` pass across the workspace
- [ ] `pnpm test` passes; new tests cover orphan tolerance, alias resolution, multi-board placement, and malformed-file isolation
- [ ] `pnpm verify:ui` passes against the migrated demo board
- [ ] Deleting [content/boards/board-demo/columns.yaml](content/boards/board-demo/columns.yaml) (after migration) and reloading the UI shows the board still rendering with slug-only column headers
- [ ] An item with `boards: [{board: dev-tasks, ...}, {board: triage, ...}]` appears on both boards with independent ordering
- [ ] No frontmatter field named `customFields._order` or `status` remains in any item file

## 4. Change Overview

| Area | Type | Description |
|------|------|-------------|
| `packages/contracts/src/schemas/` | Modify | Replace per-entity schemas with a discriminated union over `type`. Strict `ItemFrontmatter`, lenient passthrough for taxonomy entities. Add `aliases`, `boards[]` placement list. Drop `status`, `customFields._order`. |
| `packages/contracts/src/dtos.ts` | Modify | Update DTOs to slug-keyed shapes; add resolved-board view types (item + cosmetic overlay) |
| `packages/contracts/src/provider.ts` | Modify | Adjust provider interface: flat list, type-filtered queries, alias-aware lookup |
| `apps/provider-fs/src/fs/` | Modify | Replace per-type repos (`boards-repo`, `columns-repo`, `swimlanes-repo`, `items-repo`) with a single typed-markdown store; remove YAML readers/writers |
| `apps/provider-fs/src/routes/` | Modify | Routes operate on slugs and `type`; orphan-tolerant queries; per-file error isolation |
| `apps/provider-fs/content/` and `content/boards/board-demo/` | Modify | Migrate existing fixtures and demo content to flat `.md` layout; remove `*.yaml` |
| `apps/kanban-ui/src/board/` | Modify | Board view resolves item placements + cosmetic taxonomy overlay; renders missing references in degraded mode |
| `apps/kanban-ui/src/state/` | Modify | State shape keyed by slug; placement lookup goes through resolver |
| `apps/kanban-ui/src/provider/` and `apps/kanban-ui/src/providers/` | Modify | Adapt to new provider interface |
| `apps/sync-engine/src/` | Modify | File-change classification by frontmatter `type`; SSE events carry `type` and `slug` |
| `packages/provider-localstorage/src/` | Modify | Mirror new flat/typed model in localStorage |
| `packages/provider-http/src/` | Modify | Update HTTP client to new endpoints/shapes |
| Repo-level | New | A `lint:content` script that validates frontmatter, detects orphan placements, and flags alias collisions |

## 5. Use Cases

### UC-1: Render a Board
**Actor:** End user viewing the kanban UI
**Trigger:** User opens a board by slug
**Flow:**
1. UI requests all entities of `type: item` whose `boards[].board` includes the target board slug, plus all entities of `type: board | column | swimlane` referenced by those items or matching the board
2. Provider returns the typed entities, isolating any malformed file as a separate error list
3. UI resolver builds, for each item, the placement entry whose `board` slug matches (resolving aliases)
4. UI groups items by `column` slug and sorts by `order`; for each unique column slug, it overlays the cosmetic `column` entity if one exists, otherwise renders the slug as the column label
5. Same overlay logic applies to swimlanes
6. UI renders the board; malformed files are listed in a non-blocking diagnostics surface

**Input:** board slug
**Output:** rendered board with columns, swimlanes, items in order; diagnostics list
**Errors:** target board file missing → render in fully degraded mode using the slug as title; malformed item file → skip that item, surface diagnostic

### UC-2: Create an Item
**Actor:** User
**Trigger:** User creates an item on a board with a chosen column (and optionally swimlane)
**Flow:**
1. UI submits new item with title, body, tags, priority, and an initial `boards: [{board, column, swimlane?, order}]` entry
2. Provider validates against strict item schema, generates slug from title, ensures `<slug>.md` does not collide
3. Provider writes the file atomically with frontmatter + markdown body
4. Sync-engine detects file change, emits SSE `entity.upserted` with `type: item, slug`
5. UI receives event and inserts the item into the board view

**Input:** title, body, board slug, column slug, optional swimlane slug, optional priority/tags/dueDate/assignee
**Output:** new item slug
**Errors:** slug collision → provider returns conflict; column/swimlane slug unknown → accepted (degraded mode permitted); validation failure → 4xx with field errors

### UC-3: Move Item Within a Board
**Actor:** User
**Trigger:** User drags an item to a new column or position
**Flow:**
1. UI computes new `column`, optional new `swimlane`, and new `order` for the affected board placement
2. UI submits patch: update the placement entry whose `board` slug matches; leave other placements untouched
3. Provider rewrites only the target item's `.md` file
4. Sync-engine emits SSE `entity.upserted`
5. Other clients re-resolve and re-render

**Input:** item slug, board slug, new column slug, optional new swimlane slug, new order
**Output:** updated item
**Errors:** item missing → 404; board placement not found on item → 4xx (cannot move what is not placed)

### UC-4: Add an Item to a Second Board
**Actor:** User
**Trigger:** User adds an existing item to another board
**Flow:**
1. UI submits patch appending a new entry to the item's `boards[]` list with the second board's slug, an initial column slug, and order
2. Provider rewrites the item file
3. Both boards now show the item independently

**Input:** item slug, second board slug, column slug, order
**Output:** updated item
**Errors:** duplicate placement for the same board slug → 4xx

### UC-5: Rename a Column (with Alias)
**Actor:** User or hand-editor
**Trigger:** A column's slug changes from `in-progress` to `doing`
**Flow:**
1. The column file is renamed to `doing.md` and gains `aliases: [in-progress]` in its frontmatter
2. Provider's resolver, when looking up `column: in-progress` referenced by an item, finds it via the alias index
3. UI continues to render those items under the renamed column without modifying any item files
4. A separate, optional housekeeping action may rewrite items to the canonical slug; not required for correctness

**Input:** old slug, new slug
**Output:** column entity with both canonical slug and alias list
**Errors:** alias collision (alias matches another canonical slug or alias) → linter flags it; resolver prefers canonical slugs

### UC-6: Define or Edit a Column / Swimlane / Board
**Actor:** User
**Trigger:** User creates a column file with friendly title, color, WIP limit, definition-of-done
**Flow:**
1. UI submits a `column`-typed entity with slug, title, optional color, optional `wipLimit`, optional `definitionOfDone` (markdown body)
2. Provider validates lenient passthrough schema (known fields typed; unknown fields preserved)
3. File written as `<slug>.md`
4. UI re-renders any board referencing that slug, now using the friendly title and applying the WIP-limit rule

**Input:** type, slug, friendly fields, rules
**Output:** new entity
**Errors:** slug collision with existing canonical slug or alias → 4xx

### UC-7: Hand-Edit a Markdown File Externally
**Actor:** Developer or user editing a `.md` file in their preferred editor and committing
**Trigger:** A file lands in the content directory via git pull
**Flow:**
1. Sync-engine detects change, emits SSE
2. Provider re-reads the affected file; on parse failure it emits a diagnostic for that single file and continues serving other files
3. UI surfaces the diagnostic non-blockingly; the rest of the board is unaffected

**Input:** modified `.md` file
**Output:** updated entity or diagnostic
**Errors:** unknown `type` value on a non-item entity → entity is preserved as opaque (UI ignores it but does not error); unknown `type` on an item-shaped file → diagnostic surfaced

### UC-8: Reference an Undefined Column or Swimlane
**Actor:** Item file referencing `column: research` when no `research.md` exists
**Trigger:** Board render
**Flow:**
1. Resolver fails to find a column entity for slug `research`
2. UI renders a column header titled `research` (the slug, optionally humanized for display)
3. No WIP-limit, color, or definition-of-done is applied
4. Items with that column slug appear in that column normally

**Input:** item with unknown column slug
**Output:** rendered column in degraded mode
**Errors:** none — this is intentional graceful degradation

### Contracts

**Contract: frontmatter-discriminator**
- **Provider:** `@awesome-markdown/contracts`
- **Consumer:** `provider-fs`, `kanban-ui`, `sync-engine`, `provider-localstorage`, `provider-http`
- **Shape:** A Zod discriminated union on the `type` field with these variants: `item` (strict), `board` (lenient passthrough), `column` (lenient passthrough), `swimlane` (lenient passthrough). Common base fields on every entity: `type` (literal string), `slug` (string), `aliases` (string array, default `[]`), `createdAt` (ISO string), `updatedAt` (ISO string). Item-specific strict fields: `title`, `priority`, `tags`, `boards` (non-empty array of placement records), optional `dueDate`, `assignee`, `customFields` (record). Each placement record: `board` (slug), `column` (slug), optional `swimlane` (slug), `order` (number). Taxonomy-specific lenient fields: `title` (string), passthrough for any extra keys; `column` additionally types `color?`, `wipLimit?`, with body markdown carrying definition-of-done; `board` additionally types `description?`.

**Contract: entity-resolver**
- **Provider:** A shared module in `@awesome-markdown/contracts` (or a small new package) consumed by `provider-fs` and `kanban-ui`
- **Consumer:** Anything rendering or querying typed entities
- **Shape:** Given a flat collection of parsed entities, the resolver returns: a slug → entity index per `type`, an alias → canonical-slug index, and a `resolveTaxonomy(type, slug)` lookup that returns either the entity or a synthesized degraded stub `{ type, slug, title: slug, degraded: true }`.

**Contract: provider-fs HTTP API**
- **Provider:** `apps/provider-fs`
- **Consumer:** `kanban-ui` (via `provider-http`)
- **Shape:** Endpoints become entity-centric and slug-addressed: `GET /entities?type=…&board=…`, `GET /entities/:slug`, `POST /entities`, `PATCH /entities/:slug`, `DELETE /entities/:slug`. Board-view is a derivation built client-side from `GET /entities?board=<slug>` returning all referenced types in one response, plus a diagnostics envelope. SSE channel emits `entity.upserted | entity.deleted | entity.invalid` with `{ type, slug }`.

## 6. Milestones

### Milestone 1: Domain Redesign in Contracts
**Objective:** Establish the single Zod source of truth for the new markdown-driven model and the resolver primitives consumed by every other package.

**Deliverables:**
- New discriminated-union frontmatter schema in `packages/contracts/src/schemas/`
- Strict item schema with `boards[]` placements; deprecation/removal of `status` and `customFields._order`
- Lenient passthrough schemas for `board`, `column`, `swimlane`
- Common base fields: `type`, `slug`, `aliases`, timestamps
- Updated DTOs in `packages/contracts/src/dtos.ts`
- Updated provider interface in `packages/contracts/src/provider.ts`
- Resolver utility module (slug index, alias index, degraded-stub synthesis)
- Unit tests covering parse success/failure, alias resolution, degraded stubs, multi-board placements

**Use Cases:** Underpins UC-1 through UC-8 (defines the contracts those use cases rely on)

**Complexity:** 4 | **Work:** 3

---

### Milestone 2: provider-fs Flat-Store Rewrite
**Objective:** Replace the per-type YAML+markdown storage with a single flat-directory typed-markdown store, with per-file error isolation and alias-aware lookups.

**Deliverables:**
- Replace `boards-repo.ts`, `columns-repo.ts`, `swimlanes-repo.ts`, `items-repo.ts` with a single typed-entity store that scans a flat content directory and routes by frontmatter `type`
- Remove all YAML reading/writing code paths
- Implement `GET /entities`, `GET /entities/:slug`, `POST`, `PATCH`, `DELETE` routes; deprecate per-type routes
- Diagnostics envelope on read endpoints (malformed file list isolated from data)
- Atomic writes preserved; slug collision and alias collision detection
- Update fixtures in `apps/provider-fs/test/fixtures/`
- Update `apps/provider-fs/test/*.test.ts` to the new shape; add orphan-tolerance and malformed-file-isolation cases

**Use Cases:** UC-2, UC-3, UC-4, UC-5, UC-6, UC-7

**Complexity:** 5 | **Work:** 5

---

### Milestone 3: kanban-ui Resolver and Degraded Rendering
**Objective:** Adapt the UI to consume the typed-entity API, render boards via the resolver, and gracefully degrade for missing taxonomy.

**Deliverables:**
- Update state in `apps/kanban-ui/src/state/` to be slug-keyed and resolver-driven
- Update board view in `apps/kanban-ui/src/board/` to overlay cosmetic entities on top of placements; render slug-only headers when references are missing
- Update CRUD flows (create/edit/move item, edit column/swimlane) against new endpoints
- Surface diagnostics non-blockingly (e.g. a small badge listing malformed files)
- Update `apps/kanban-ui/src/provider/` and `providers/` to call the new endpoint shape
- Update `apps/kanban-ui/agent-browser/` smoke suites; ensure `pnpm verify:ui` passes

**Use Cases:** UC-1, UC-3, UC-4, UC-6, UC-8

**Complexity:** 4 | **Work:** 4

---

### Milestone 4: Sync-Engine and Adjacent Providers
**Objective:** Align the file-watcher, SSE event shape, and the localStorage / HTTP providers to the new model.

**Deliverables:**
- Update `apps/sync-engine/src/` to classify file changes by frontmatter `type` and emit `entity.upserted | entity.deleted | entity.invalid` events with `{ type, slug }`
- Update `packages/provider-localstorage/src/` to store and validate entities under the new schema
- Update `packages/provider-http/src/` client to call the new endpoints and types
- Refresh tests across all three packages

**Use Cases:** UC-2, UC-3, UC-7 (event delivery and offline mirroring)

**Complexity:** 3 | **Work:** 3

---

### Milestone 5: Content Migration
**Objective:** Convert existing demo content and fixtures to the flat typed-markdown layout, preserving git history where practical.

**Deliverables:**
- Migrate [content/boards/board-demo/board.yaml](content/boards/board-demo/board.yaml), [columns.yaml](content/boards/board-demo/columns.yaml), [swimlanes.yaml](content/boards/board-demo/swimlanes.yaml) to per-entity `.md` files
- Migrate item files from `items/` subdirectory to the flat layout; rewrite frontmatter to the new schema (drop `status`, lift `_order` into `boards[].order`, slugify IDs); use `git mv` where filenames change so history is preserved
- Migrate provider-fs test fixtures
- Remove the now-empty `items/` directory and the YAML files
- Verify the migrated content renders and round-trips through the UI

**Use Cases:** Validates UC-1 against real content

**Complexity:** 2 | **Work:** 3

---

### Milestone 6: Content Linting and Validation Tooling
**Objective:** Provide a repo-level guardrail that catches schema drift, alias collisions, and orphan placements before they reach production.

**Deliverables:**
- A `pnpm lint:content` script that walks the content directory, validates each file against the contracts schema, reports malformed files, alias collisions, duplicate canonical slugs, and items with placements referencing nonexistent boards (orphans)
- The script returns non-zero on hard errors (parse failure, slug/alias collision) and zero with warnings on soft issues (orphans, unknown taxonomy slugs — by design these degrade gracefully)
- Wire into existing quality gates documented in [.github/copilot-instructions.md](.github/copilot-instructions.md)
- Documentation in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describing the markdown-driven model, the strict/lenient split, and the alias mechanism

**Use Cases:** Supports UC-5, UC-7, UC-8

**Complexity:** 2 | **Work:** 2

---

**Review Checkpoint:** After creating this main plan, pause for user review before generating detailed milestone files.

## 7. Validation & Verification
- `pnpm typecheck && pnpm lint` clean across the workspace
- `pnpm test` passes; new cases cover: parse-malformed-file isolation, alias resolution, degraded-mode rendering, multi-board placements, slug collisions
- `pnpm verify:ui` passes against migrated demo content
- `pnpm lint:content` passes on the migrated `content/` tree
- Manual: delete a column file post-migration, confirm UI degrades gracefully
- Manual: rename a column with alias, confirm items still resolve
- Manual: add a second board placement to an item, confirm it appears on both boards

## 8. Rollback Strategy
- Each milestone lands on its own branch and PR; revert is a `git revert` of the merge commit
- Milestone 5 (content migration) is the destructive step — keep the pre-migration commit reachable on a tag (`pre-md-realignment`) so the YAML+items layout can be restored verbatim if needed
- Milestones 1–4 are additive at the type level until Milestone 5 removes the old code paths; if blocking issues are found before Milestone 5 lands, earlier milestones can be reverted independently
- The provider-localstorage data is not migrated automatically; a wipe of that store on first load after upgrade is acceptable (no real user data)

## 9. Open Questions
- Should the resolver and entity-store live in `@awesome-markdown/contracts` or in a new `@awesome-markdown/core` package? (Defaulting to contracts to avoid a new package; revisit if it grows large.)
- Should the provider expose a single batched `GET /entities?board=<slug>` for board rendering, or should the UI compose the result client-side from `GET /entities?type=…` calls? (Defaulting to a single batched endpoint to minimize round trips.)
- Should `aliases` apply to items as well, to support item slug renames, or only to taxonomy entities? (Defaulting to all entities for symmetry; cost is small.)
- Slug humanization for degraded column headers: do we want a built-in `kebab-case` → `Title Case` transform, or render the raw slug? (Defaulting to raw slug; trivial to humanize later.)
- Should the board file itself remain meaningful as an entity (carrying title, description) once items are the source of truth for membership? (Yes — the board file holds cosmetic title/description and could carry global rules later.)

## 10. References
- Existing schemas: [packages/contracts/src/schemas/item.ts](packages/contracts/src/schemas/item.ts), [board.ts](packages/contracts/src/schemas/board.ts), [column.ts](packages/contracts/src/schemas/column.ts), [swimlane.ts](packages/contracts/src/schemas/swimlane.ts)
- Existing content: [content/boards/board-demo/](content/boards/board-demo/)
- Architecture doc: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Project guide: [.github/copilot-instructions.md](.github/copilot-instructions.md)
- Zod v4 discriminated unions: https://zod.dev/api?id=discriminated-unions
- gray-matter (frontmatter parser already in use): https://github.com/jonschlinkert/gray-matter
