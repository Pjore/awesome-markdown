# Item properties and contextual filters: implementation plan

Status: agreed design, implementation pending. This PR changes documentation only.

## Goal and delivery rules

Integrate a read-first item page and recursive property editor into the existing application. Boards and axes select items exclusively through their `filter` definitions. Support both `$board` and `$axis` contextual list selectors.

This is a pre-release change: change existing contracts and implementations directly. Do not retain obsolete APIs, add compatibility modes, dual-write formats, or introduce adapters merely to preserve old behavior. Prefer extending existing modules and deleting duplicate code over adding layers. No application changes are authorized by this plan-only PR.

Use the existing provider abstraction; support localStorage and HTTP/filesystem together. Saving is explicit, never an additional browser draft store or autosave. Upgrade affected packages, applications, fixtures, and content configurations together.

## Agreed behavior

### Item data

- Only root `entityType`, `slug`, `createdAt`, and `updatedAt` are guaranteed metadata. They are read-only to users. Preserve identity and creation time; the provider updates `updatedAt` on successful changes and returns the authoritative saved item.
- Other frontmatter properties are recursive text, finite numbers, booleans, null, mappings, or heterogeneous lists. `title`, `order`, `boards`, `axes`, `status`, and `tags` have no schema imposed by their names. Nested metadata names remain editable.
- Exception: `body` keeps its existing API meaning as Markdown document content, not a dynamic root frontmatter property. Do not introduce a new document envelope. A colliding frontmatter `body` is unsupported; do not silently discard it on save.
- The heading uses a nonempty string `title`, otherwise `slug`. Do not insert or coerce a title. Apply this fallback to cards and other item consumers, not just the detail page. Existing item creation may still request a title as a workflow convenience; it must not make title mandatory for reading or saving existing items.
- Preserve property order, list order, empty containers, empty text, null, literal keys, and timestamp strings. Use structural editor paths (`Array<string | number>`), never concatenate user keys into dotted mutation paths.
- Accept ordinary JavaScript floating-point decimals; exact decimal arithmetic is out of scope. Reject non-finite numbers and unsafe integers, including on source ingestion before parsing can silently round them. Identifiers needing exact representation remain text.

### Bounds and invalid source data

Apply the same bounds in the UI and both providers:

| Limit                    | Value                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| Container nesting        | 16 levels; the root mapping is level 1                                          |
| Values                   | 5,000; count each mapping/list and scalar once, including metadata and API body |
| Serialized item Markdown | 512 KiB (524,288 UTF-8 bytes), including frontmatter and document text          |

Do not truncate, coerce, or overwrite unsupported existing data. Surface an actionable load/validation error rather than substituting example data. Reject unsupported/cyclic structures and unsafe property names without executing data or treating it as markup. Test exactly-at-limit and over-limit cases, including multibyte text. Request-envelope limits must allow transport overhead without changing the document limit.

### Board and axis selection

A simple board can use:

```yaml
filter:
  property: board
  equals: main
```

An item with `board: main` matches. A missing filter selects the whole item pool. No implicit membership check is added.

For board-specific data, an item may instead contain:

```yaml
boards:
  - board: board-dev
    order: c07
    status: doing
    axes:
      - axis: axis-doing
        order: a02
```

The `board-dev` definition can select it through:

```yaml
filter:
  property: boards.$board.board
  equals: board-dev
```

An axis can filter on `boards.$board.status`, or use axis-specific data:

```yaml
filter:
  property: boards.$board.axes.$axis.axis
  equals: axis-doing
order:
  by: boards.$board.axes.$axis.order
  direction: asc
```

- `$board` selects a list group whose `board` equals the current board slug; `$axis` selects one whose `axis` equals the current axis slug. These are path-language features, not required item fields. List names themselves are not special. No `listLookups` configuration is introduced.
- In axis `filter`, `order`, and `writeOnDrop`, `$axis` binds to that definition's axis. Bind column and swimlane expressions separately before combining them with the board filter. The board filter has no axis context; unbound variables are configuration errors.
- Preserve dotted configuration syntax and escaped literal dots. Keep editor structural paths distinct from contextual configuration paths. Retain selector key identity when binding variables; flattening both selectors into anonymous string segments would lose whether to match `board` or `axis`.
- Missing selector matches produce a missing value, distinct from null. Ignore primitive list elements and groups without the selector key. Multiple matching entries produce a visible lookup error, never a first-match result; block affected writes without changing item data. The generic editor does not enforce list uniqueness.
- Explicit board writes may create a missing list and selected group, including its `board`/`axis` key. Incompatible existing structures or ambiguous matches fail atomically. Reading, ordinary editor saves, and deletions never create selector entries as a side effect.
- `/homeless` uses the board-filter candidate set and identifies candidates matching no column. Remove its independent `boards[]` membership prerequisite.
- Column `order` takes precedence, then swimlane `order`, then `updatedAt` descending. Keep the existing timestamp tie/missing-value fallback. Reordering writes only the selected sort target. Incompatible structures are errors, not opportunities to replace user data.
- Manual fractional-key reordering is enabled only for a compatible ascending string order target and compatible neighbor values. Otherwise disable reordering, while allowing cross-cell placement when its configured writes permit it. Do not invent a `boards.<slug>.order` target when no manual sort is configured.

### Page and edit session

- Start in read mode. Render actual dynamic properties recursively, without domain sections, schema guesses, placeholders, board-specific overrides, or edit controls. Metadata has a separate read-only disclosure; Markdown has a separate document area.
- Primitive types are visibly distinguishable, including `"003"`, `3`, `false`, `"false"`, empty text, and null. Container counts are direct child counts; composite list entries use their position, not a required title field.
- Edit captures an entry snapshot. Working properties and document text share one Save/Cancel session. Successful save returns to the item's read view, not to the board. Failure retains the complete draft and edit mode.
- Cancel confirms changed/incomplete input and restores the exact entry snapshot. Unsaved navigation is guarded where supported. Disclosure and preview state do not dirty the item; list removal must not transfer disclosure or incomplete number state to another entry.
- Add forms show destination, collect name/type for mappings and type only for list entries, and commit only on confirmation. Defaults: text `""`, number `0`, boolean `false`, group `{}`, list `[]`, null `null`. Trim names; reject blank, duplicate-in-group, `__proto__`, `prototype`, and `constructor` names, case-sensitively. No rename, reorder, or general conversion; null can be replaced by a supported type.
- Remove primitive values and empty containers immediately from the draft. Confirm deletion of nonempty groups/lists. No persistent write until Save, and no general undo feature.
- Keep incomplete numeric input separate from valid structured data. It blocks Save and exports and replaces the YAML preview with an explanation. Correction or removal clears the error.
- `?board=…` supplies return-navigation context only. Future board-specific presentation is outside this delivery. Saving a filter change may remove the item from the originating board, but the item page remains accessible and primary.
- All fields have labels; disclosures and actions are keyboard-operable. Add/cancel/delete flows restore useful focus; reveal containing groups when focusing errors. Announce saves, errors, additions, and removals accessibly.

### Persistence and recovery

Use optimistic concurrency, not last-write-wins. Read an opaque revision outside item frontmatter, and require it on editor saves. Compare with current persisted content, not only a watcher/index snapshot, before committing. Serialize competing provider writes per item. A stale revision yields a conflict and leaves draft/source untouched; do not treat timestamp equality as sufficient protection. An externally deleted item is not silently recreated.

Validate the complete resulting item and write properties plus body atomically. Reject user mutations of root system metadata server-side as well as in UI. Reuse the same revision/validation/write path for board operations so they cannot bypass integrity rules. Preserve edits on incoming subscription events; never replace an active edit snapshot behind the user's back. Reloading after a conflict requires discard confirmation; automatic merge is out of scope.

Generate YAML from structured data, quote strings and keys safely, and preserve timestamp text without YAML date coercion. YAML preview/copy/download excludes document content. Also provide Markdown download containing frontmatter and body for full-draft recovery. Export uses current valid data, never stale last-valid numbers, and never marks it saved. Safe filenames derive from slug with `item.yaml`/`item.md` fallbacks; report clipboard/download errors.

Comments, source formatting, anchors/aliases, YAML import, direct YAML editing, example reset, and prototype restore/example behavior are not production features in this plan.

## Implementation sequence

### 1. Contracts and validation foundation

Touch `packages/contracts/src/schemas/item.ts`, `schemas/mutation.ts`, `dtos.ts`, and `provider.ts`.

- Replace required title and specialized `boards`/`order` schemas with validated recursive values plus the body exception and protected metadata.
- Define safe structural edit operations and contextual selector-aware writes in the existing mutation contract. Replace the old contract and callers together, not via a second API family. Preserve named append/remove operations used by existing workflows without imposing uniqueness on generic list editing.
- Add revision preconditions/responses and shared bound/number validation. Keep revisions outside saved item data and exports.
- Audit all item consumers, create flows, card labels, board helpers, and fixtures for assumptions about title, boards, order, and body. Update them directly.

Exit: metadata-only and heterogeneous items validate; unsupported input fails without data loss; all revised callers typecheck.

### 2. Contextual paths and shared mutation application

Touch `packages/filter-engine/src/{path-resolver,evaluate,mutations,invertibility}.ts`, `packages/core/src/apply-mutations.ts`, and `packages/provider-localstorage/src/mutations.ts`.

- Extend the existing path resolver with explicit board/axis selector semantics and structured index access; preserve literal keys and reject unbound/ambiguous selectors.
- Bind axis expressions in their own context before composing cell rules. Preserve existing explicit write-on-drop/read-only semantics and combined-filter invertibility rules.
- Remove duplicate localStorage mutation application in favor of the core implementation. Validate a cloned complete result before commit; never partially apply a failing batch or silently ignore incompatible navigation.

Depends on step 1. Exit: both selectors, nested selectors, index edits, upserts, ambiguity, literal dots/backslashes, and protected paths have focused tests.

### 3. Providers and source roundtrips

Touch `packages/provider-{localstorage,http}`, `apps/provider-fs/src/routes/items.ts`, its persistence/index helpers, and `packages/core/src/markdown.ts`.

- Implement shared validation and revision checking in both providers; ensure current on-disk content is checked despite delayed watcher events. Coordinate with existing sync/file-write mechanisms rather than adding a second persistence layer.
- Preserve type/key/timestamp fidelity at parsing and serialization boundaries, including unsafe-number detection before lossy conversion, multiline text, and document text. Detect unsupported body collisions.
- Retain the existing atomic-file-write mechanism, update index/events only after commit, and return the actual saved record/revision. A failed operation must not advertise success.

Depends on steps 1–2. Exit: identical provider conformance tests, filesystem roundtrips, stale/deleted-source cases, simultaneous saves, and no partial writes pass.

### 4. Board rendering and interaction

Touch `packages/core/src/render.ts`, `packages/board-ui/src/board/dnd/mutateDragDrop.ts`, axis defaults and relevant board/layout consumers.

- Apply filter-only candidates consistently to rendering and homeless results.
- Use bound contexts for column and swimlane filters, sort resolution, read-only analysis, item creation, and drag/drop writes.
- Remove hardcoded per-board order reads/writes. Resolve the configured column/swimlane sort target and generate at most one atomic item write for each drop.
- Surface lookup/configuration errors without crashing unrelated item views; failed optimistic actions restore/refetch authoritative state.

Depends on steps 2–3. Exit: simple/global, per-board, per-axis, and nested configurations work; both axis dimensions remain distinguishable; no hidden membership/order writes remain.

### 5. Recursive item page and recovery

Refactor `packages/board-ui/src/pages/ItemEditorPage.tsx` and existing property display/actions. Add only focused recursive field/container and edit-state helpers where needed; remove obsolete dedicated title/board-assignee editing and detail-layout gating from this page.

Implement the read/edit model, snapshots, validated draft inputs, focus/disclosure stability, deletion safeguards, subscription/conflict behavior, and YAML/Markdown recovery described above. Reuse current provider/router boundaries rather than introducing a separate editor platform. Share serialization rules between save and export without pulling Node-only `gray-matter` into the browser.

Depends on steps 1–3; exercise originating-board behavior with step 4. Exit: all page acceptance scenarios pass for metadata-only, nested, mixed-list, and board-independent items in both providers.

### 6. Integration, documentation, and release

- Inventory and update affected repository fixtures/configurations and documentation to the new contracts. Keep valid `boards.$board.*` configurations; do not convert them to a singular board property. Remove obsolete assumptions instead of maintaining compatibility branches.
- Review interaction with the separate raw-frontmatter editor PR [#52](https://github.com/Pjore/awesome-markdown/pull/52). Do not build a parallel editable YAML source or make this design depend on that unmerged PR; reconcile/delete overlapping editor code if it lands first.
- Extend existing tests and browser scenarios rather than creating a second verification framework. Keep TypeScript source files within the repository's 400-line limit.
- Ship the affected packages/apps together. There is no old/new protocol compatibility promise or mixed-version support. Merging runtime changes to main deploys production; this plan-only PR does not implement that release.

## Verification and release acceptance

Run focused suites after each implementation step. Before the implementation PR is ready, run the repository gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm verify:ui`, and the kanban UI build. Execute real browser scenarios with `agent-browser`; scenario-descriptor validation alone is not browser verification. Use clean localStorage seeds and a temporary filesystem content root; do not edit live household content or credentials.

Required coverage:

- Metadata-only items, title fallback across consumers, every primitive/container type, nested metadata names, mixed lists, empty values, and literal path keys.
- All add/cancel/delete/focus flows; exact snapshot recovery; numeric errors surviving unrelated edits and clearing on removal; disclosure state following the same list entry after reindexing.
- Save/reload/export roundtrips in both providers; full-document recovery; clipboard/storage/network failures; incoming events, stale revisions, deleted files, and competing writes.
- Simple board filter, no board filter, filter-only homeless candidates, board-specific status/order, axis-specific/nested selectors, both dimensions, unbound variables, duplicate matches, and missing-entry creation only on explicit writes.
- Configured ordering precedence and fallbacks; disallowed manual reorders; cross-cell writes with one atomic commit; incompatible user data never silently normalized.
- Bounds at/over every threshold, unsafe numeric source literals, malicious keys, and no false success/events after failure.

Deliver implementation in dependency-ordered commits, without redundant abstraction or compatibility scaffolding. Property renaming, general type conversion, arbitrary list-key configuration, schema/presentation editors, relational lookups, multi-user merging, import, and revision history remain out of scope.
