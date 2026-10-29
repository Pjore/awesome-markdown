# Item properties and contextual filters

Items open in **read mode**. The item's Markdown content appears directly below its heading, without an additional UI heading or visible field label. Properties follow, displayed recursively with their types; system metadata has a separate read-only disclosure. The heading (including board cards) uses a nonempty string `title`, otherwise `slug`.

**Edit** starts one explicit session for properties and document text. **Save** persists them together and returns to the item's read view, even if its new properties remove it from the originating board. **Cancel** restores the entry snapshot, confirming dirty or incomplete input. Changing disclosures or opening the preview does not dirty the item. Browser unload and ordinary in-app links are guarded; history/programmatic navigation depends on the host router's capabilities.

## Data contract

Only root `entityType`, `slug`, `createdAt`, and `updatedAt` are fixed metadata. Nested properties with those names are editable. `body` is reserved at the API root for Markdown document content; an existing frontmatter `body` collision produces a validation error, never a silent overwrite.

All other names, including `title`, `boards`, `axes`, `status`, `tags`, and `order`, accept recursive text, finite numbers, booleans, null, mappings, and heterogeneous lists. No title or board entry is required to read/save an existing item. Creation may request a title as a workflow convenience.

Limits are shared by the UI and both providers:

- 16 container levels, counting the root mapping as level 1.
- 5,000 values, counting each container and scalar once, including metadata and API body.
- 524,288 UTF-8 bytes of serialized Markdown, including frontmatter and document text.

Unsupported structures, unsafe integers/non-finite numbers, cycles, aliases, duplicate YAML keys, and `__proto__`, `prototype`, or `constructor` keys are rejected. Numeric source tokens are checked before lossy JavaScript conversion. Ordinary floating-point decimals remain supported; exact identifiers should be text. Timestamp-like text stays text. Invalid localStorage/source data produces a repairable load error rather than an empty/example store.

New properties require a trimmed, nonblank, safe name unique within their group. List entries need only a type. Defaults are empty text, zero, false, null, empty group, or empty list. There is no rename/reorder/general conversion action; null can be replaced by a supported type. Removing a nonempty container requires confirmation. All edits remain in memory until Save.

Incomplete numbers retain their literal input independently of structured values. They block Save, YAML preview, and exports until corrected or removed. List entry state follows the entry rather than its changing position.

## Paths and board selection

Boards and axes select items **only** through filters. An omitted filter selects the entire pool; `/homeless` contains board-filter candidates matching no column. `boards[]` is not implicit membership.

```yaml
# A simple board can select a scalar property.
filter:
  property: board
  equals: main
```

Contextual lists are optional, not a required item schema:

```yaml
boards:
  - board: board-dev
    status: doing
    order: c0V
    axes:
      - axis: axis-doing
        order: aP
```

A board can select `boards.$board.board`; an axis can use `boards.$board.status` or `boards.$board.axes.$axis.axis`. `$board` selects a group by its `board` key and `$axis` by its `axis` key, regardless of the list property's name. Column and swimlane definitions bind `$axis` independently, including their filter, order, and explicit drop writes. Board filters have no axis context; unbound variables are configuration errors.

Missing matches are missing values, not null. Primitive entries and groups without the selector key are ignored. Duplicate matches are visible lookup errors and block affected writes. Explicit writes can create missing lists/groups; reads, ordinary structural saves, and deletes never do so. Incompatible containers fail atomically rather than being replaced.

Configuration paths use dots with escaped literal dots/backslashes. Editor operations use arrays of literal keys and numeric indices. Bound writes retain selector identity:

```json
{"op":"set","path":["boards",{"selector":"board","value":"board-dev"},"status"],"value":"doing"}
```

Column ordering wins over swimlane ordering, then `updatedAt` descending provides the fallback/tiebreak. String ordering is lexicographic. Manual reordering requires a configured ascending string target with compatible fractional-key neighbors. Otherwise only cross-cell placement writes are allowed. No implicit order or membership write is added. Each drop is one atomic item PATCH.

## Persistence protocol and recovery

Item GET/create/PATCH responses are `{ item, revision }`. The opaque revision is **outside** item frontmatter. PATCH requires `{ revision, mutations }`; missing/stale revisions cannot overwrite a newer source. The filesystem provider hashes persisted bytes, rereads disk under a per-item lock, and atomically renames the completed write before updating the index/events. localStorage coordinates provider instances and uses Web Locks across supported browser tabs. Board actions use the same validated revision path. Deleted items are not recreated by stale saves.

This is a coordinated protocol change: update contracts, providers, and applications together. Old and new clients are not wire-compatible.

Incoming events never replace an active edit snapshot. A failed/conflicting save keeps the complete draft and edit mode. Reloading current source requires discard confirmation; automatic merge is not provided.

**YAML preview / Copy YAML / Download YAML** contain properties only. The preview is a YAML code block with ordinary unquoted keys where safe; ambiguous keys and string values are quoted safely. **Download Markdown** contains properties and document text. Both export the current valid draft, use safe filenames, report failures, and never mark the item saved. Downloads are not treated as unsaved navigation. Source comments, formatting, anchors, YAML import, and direct YAML editing are not editor features.

## Coordinated release

Version 2.0.0 introduces this breaking item protocol. Dokploy builds provider-fs and kanban-ui from the same Git checkout on main deployments, rather than combining a new UI with a previously published API image. Its existing domain/router labels and content volume are unchanged. Release tags publish the coordinated shared packages and container images; the existing deployment workflow refreshes the stack.

The provider's authenticated `/health` reports its installed package `version` and `itemProtocol: 2`; verify that plus a revision-bearing item GET before declaring deployment successful. Home's board Extension must use the revisioned protocol too. Upgrade its declared package through the supported Home reconciliation flow, never by editing an installed package or its runtime lock.

## Verification

Run the repository gates and the UI build as described in `CONTRIBUTING.md`. Provider conformance cases are shared in `scripts/tests/item-provider-conformance.ts`; UI unit tests cover recursive editing, numeric state, cancellation, conflicts, and recovery failures.

For real browser verification, start the UI plus provider-fs against a **temporary** content root, then run the M3 live extension (requires `agent-browser`):

```bash
UI_URL=http://127.0.0.1:5183 PROVIDER_URL=http://127.0.0.1:7713 \
  node apps/kanban-ui/agent-browser/m3/runner.mjs --live
```

The explicit `?seed=m3` demo provisions two boards (`m3-demo`, `m3-release`) sharing contextual `boards.$board.*` axes and overlapping items with independent board-specific values. Rerunning the seed extends older demos without replacing their item content or existing board entries.

The live extension seeds isolated localStorage, creates/removes its own temporary filesystem item, exercises both providers (including actual page scrolling to the footer on desktop/mobile), and writes recovery downloads/mobile screenshots under `/tmp`. Do not point it at live household content. The normal `pnpm verify:ui` command validates descriptors; it is not a substitute for this live browser run.
