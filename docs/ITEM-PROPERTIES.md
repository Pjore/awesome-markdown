# Items, boards and contextual properties

## Read and edit an item

An item opens in read mode. Its Markdown document appears directly beneath the item heading, followed by recursive properties and a separate system-metadata disclosure. The heading uses a nonempty string `title`, otherwise `slug`.

**Edit** captures a snapshot for one property/document session. **Save** commits the complete valid draft and returns to the item's read view. **Cancel** restores the entry snapshot, confirming changed or incomplete input. Incoming events preserve an active edit snapshot; a conflict retains the complete draft for correction, recovery export or an explicit discard/reload decision.

Every field has an accessible label. Group disclosures and actions support keyboard use; list-entry UI state follows the same entry as positions change. Add forms collect a group property name/type or a list entry type, then commit on confirmation. Names are trimmed and validated within their group. Defaults are empty text, zero, false, null, empty mapping or empty list. Removal of a nonempty container asks for confirmation. Null can be replaced by a supported type.

The item page keeps the originating `?board=…` for return navigation. Saving may change which boards/cells match the item while keeping the item page open.

## Item data

Root `entityType`, `slug`, `createdAt` and `updatedAt` are fixed system metadata. The provider preserves identity/creation time and updates `updatedAt` after a successful change. Other frontmatter properties are recursive text, finite numbers, booleans, null, mappings and heterogeneous lists. Nested metadata names are editable ordinary properties. At the API root, `body` represents the Markdown document text.

```yaml
---
entityType: item
slug: add-search
createdAt: "2026-01-01T10:00:00Z"
updatedAt: "2026-01-01T10:00:00Z"
title: Add search
repo: awesome-markdown
code: "003"
boards:
  - board: board-main
    column: todo
    assignee: assistant
    order: "aP"
---
# Goal

Make items easy to find.
```

Property/list order, literal keys, empty containers/text, null and timestamp strings are preserved. Numeric input retains incomplete text until corrected or removed. Valid structured data uses ordinary JavaScript floating-point decimals; exact large identifiers belong in text.

Shared bounds:

| Limit | Value |
|---|---|
| Container levels | 16, with the root mapping at level 1 |
| Values | 5,000, counting each container/scalar once, including metadata and API body |
| Item Markdown | 524,288 UTF-8 bytes, including frontmatter and document text |

Use supported plain containers, safe property names, finite numbers and safe integers. Validation identifies unsupported structures, ambiguous lookups and bound violations before committing. Incomplete/invalid input blocks Save, YAML preview and exports until resolved.

## Define a board

Boards project matching items through filters. An omitted board filter selects the pool. Define a filter as an object; group several rules with `all` or `any`:

```yaml
---
entityType: board
slug: board-main
title: Main
createdAt: "2026-01-01T10:00:00Z"
updatedAt: "2026-01-01T10:00:00Z"
filter:
  property: boards.$board.board
  equals: board-main
columns: [backlog, todo, doing, done]
swimlanes: [awesome-markdown, awesome-family, agent-workspace, agentswarm]
---
```

```yaml
filter:
  all:
    - property: boards.$board.column
      equals: todo
    - property: repo
      equals: awesome-markdown
```

`$board` binds to the current board slug. Match the comparison value to the intended current board, e.g. `equals: board-main` for `slug: board-main`. In the UI condition builder enter **Property**, **Operator** and **Value** separately; `equals` is labeled **is**.

`/homeless` contains board-filter candidates matching no column. Columns and swimlanes further project the candidates into cells.

## Define columns and repository rows

A workflow column:

```yaml
entityType: axis
slug: todo
title: To do
filter:
  property: boards.$board.column
  equals: todo
order:
  by: boards.$board.order
  direction: asc
```

A repository row:

```yaml
entityType: axis
slug: agent-workspace
title: agent-workspace
filter:
  property: repo
  equals: agent-workspace
order:
  by: boards.$board.order
  direction: asc
```

Reference row slugs in the board's `swimlanes` array. The same axis can be reused by several boards/dimensions. In a configured Home, inspect and add repository rows through its selected Extension:

```bash
home board board
home board axes
home board rows --repo agent-workspace --repo agentswarm --repo awesome-markdown-cloud
home board connection
```

This operation preserves existing rows, reuses suitable definitions and creates missing ones. It returns added, created and reused axis slugs.

## Contextual paths and writes

`$board` selects a list group by its `board` identity. `$axis` selects by `axis` and binds independently to the column/swimlane definition. List property names are ordinary names, so nested configurations can use `boards.$board.axes.$axis.order`.

Configuration paths use dots with escaped literal dots/backslashes. Editor/mutation paths use arrays of literal keys and numeric indices. Explicit contextual writes retain selector identity:

```json
{"op":"set","path":["boards",{"selector":"board","value":"board-main"},"column"],"value":"doing"}
```

Missing selector matches yield a missing value. Primitive list entries and groups without the selector key are skipped during lookup. Duplicate identities or incompatible containers produce an actionable error identifying the item. Explicit writes can create missing lists/groups; ordinary reads/saves/deletions preserve their structure.

Writable placement derives from the combined board/column/swimlane rules, with each axis's override bound in its own context. Column ordering takes precedence, then swimlane ordering, then `updatedAt` descending provides fallback/tiebreak behavior. Manual reordering uses a configured ascending string target with compatible fractional keys and writes that target alone. Each drop commits one atomic item update.

## Persistence and recovery

GET/create/PATCH item responses are `{ item, revision }`. PATCH accepts `{ revision, mutations }`. The provider compares persisted source, serializes competing writes per item, validates the completed result and commits atomically before index/events are updated. The successful response is authoritative.

**YAML preview / Copy YAML / Download YAML** contain properties. The preview is a styled YAML code block with plain keys where safe and safely quoted text. **Download Markdown** contains properties and document text. Exports use the current valid draft and safe slug-derived filenames, report failures and keep the edit session's saved/dirty state intact.

For planned Home updates, capture `home board snapshot SLUG` into a protected backup and pass its revision unchanged to the update. Keep private mutation values in protected files/JSON stdin to `home board operate`.

## Verify operation

Run the gates in `CONTRIBUTING.md`. Provider conformance cases share `scripts/tests/item-provider-conformance.ts`; UI tests cover recursive editing, numeric state, cancellation, conflicts and recovery.

With the localStorage provider, `?seed=m3` provisions two boards with shared `boards.$board.*` axes and independent board-scoped item values. Use a temporary filesystem content root for live browser coverage:

```bash
UI_URL=http://127.0.0.1:5183 PROVIDER_URL=http://127.0.0.1:7713 \
  node apps/kanban-ui/agent-browser/m3/runner.mjs --live
```

The live runner exercises both providers, actual desktop/mobile scrolling, Save/Cancel, concurrency and recovery downloads. `pnpm verify:ui` validates scenario descriptors.

Dokploy builds provider-fs and kanban-ui from the same checkout. Release tags publish packages/images and refresh the stack. Authenticated API health reports the installed version and `itemProtocol: 2`; `home board connection --task SLUG` also checks actual board/item readability. Adopt approved Extension updates through the Home declaration and Steward reconciliation, then verify the installed binding against its declared remote.
