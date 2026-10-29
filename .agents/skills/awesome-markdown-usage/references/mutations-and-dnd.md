# Mutations and drag/drop

Contracts: `packages/contracts/src/schemas/mutation.ts`. Shared application: `packages/core/src/apply-mutations.ts`.

## Operations

- `set` accepts any supported recursive value, including containers and null.
- `append` adds a string/number to a list with idempotent membership semantics. Root API `body` appends text as a paragraph.
- `remove` removes a string/number from a list with idempotent membership semantics.
- `delete` removes the addressed key or indexed list entry.

Editor paths are arrays of literal keys and numeric indices. Explicit contextual writes retain selector identity:

```json
{
  "op": "set",
  "path": ["boards", {"selector":"board","value":"board-main"}, "column"],
  "value": "doing"
}
```

A literal key containing dots can be addressed directly:

```json
{"op":"set","path":["literal.key"],"value":{"nested":true}}
```

Providers clone the item, apply the entire batch, validate the complete result and commit one write. Root system metadata is protected; the provider owns `updatedAt`.

## Cell placement

The effective placement rules combine the board filter and each axis definition. Each axis binds `$axis` to its own slug; `$board` binds to the selected board. `equals`, single-value `in`, `has`, `lacks`, `exists: false` and invertible `all` groups derive writes.

An axis may specify explicit writes for its dimension:

```yaml
filter:
  property: tags
  has: urgent
writeOnDrop:
  - op: append
    path: tags
    value: urgent
  - op: set
    path: priority
    value: high
```

`writeOnDrop: { readonly: true }` marks the dimension read-only. Read-oriented conditions such as `any` and comparisons retain their selection behavior; explicit axis writes provide the intended writable placement where applicable.

Explicit selector writes can create a missing list/group and its identity key. Reads, ordinary structural saves and deletions preserve the existing structure. Ambiguous matches and incompatible containers produce errors and keep the original item unchanged.

## Ordering

A cross-cell drop includes placement writes and a configured sort write when manual ordering is compatible. A same-cell reorder writes only the selected sort target. Column order takes precedence over swimlane order, then `updatedAt` descending provides fallback/tiebreak behavior.

## Revision protection

Read `{ item, revision }`, then PATCH `{ revision, mutations }`. The provider compares persisted source, serializes competing writes per item and returns the authoritative saved record. A stale revision yields a conflict; retain the draft or recovery export and explicitly choose whether to discard/reload.

For Home operations, take `home board snapshot SLUG` into a protected backup and pass its revision unchanged to the planned update. Send private mutation payloads to `home board operate` on stdin.
