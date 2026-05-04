# @awesome-markdown/filter-engine

Isomorphic filter evaluation, invertibility analysis, mutation derivation,
and fractional-index ordering helpers for the `awesome-markdown` kanban
system.

**No Node-only or browser-only APIs.** Safe for use in `apps/provider-fs`
(Node), `packages/provider-localstorage` (browser), and `apps/kanban-ui`
(browser).

## Exported surface

```ts
import {
  evaluate,
  analyzeInvertibility,
  deriveMutations,
  compareOrderKeys,
  keyBetween,
  // path helpers
  parsePath,
  joinPath,
  resolvePath,
  substitutePath,
} from '@awesome-markdown/filter-engine';
```

### `evaluate(filter, item, ctx) → boolean`

Returns `true` when `item` satisfies `filter`.  
`filter = undefined` → match-all (used for synthetic axes, UC-7).

### `analyzeInvertibility(filter) → InvertibilityResult`

Returns `{ invertible: boolean; reasons: string[] }`.  
`reasons` is populated only when `invertible` is `false`.

### `deriveMutations(filter, ctx, override?) → Mutation[] | { readonly: true }`

Derives the mutation list for placing an item into a cell.

- `override = Mutation[]` → use the explicit list verbatim.
- `override = { readonly: true }` → always read-only.
- Non-invertible filter (no override) → `{ readonly: true }`.

### `compareOrderKeys(a, b) → number`

Lexicographic comparator for order keys, consistent with `keyBetween`.

### `keyBetween(lo?, hi?) → string`

Generate a fractional-index key strictly between `lo` and `hi`.
Either argument may be omitted for "before first" / "after last".

## Strict α invertibility policy

> If **any** part of a combined cell filter is non-invertible, the **entire
> cell is read-only**. There are no partial inverses.

`deriveMutations` enforces this: if `analyzeInvertibility` returns
`{ invertible: false }` and no `writeOnDrop` override is provided,
`{ readonly: true }` is returned.

## Operator invertibility table

| Operator | Invertible | Inverse write |
|---|---|---|
| `equals: x` | ✓ | `set = x` |
| `in: [x]` (single value) | ✓ | `set = x` |
| `in: [x, y, …]` (multi) | ✗ | — |
| `has: x` | ✓ | `append x` (idempotent) |
| `lacks: x` | ✓ | `remove x` (idempotent) |
| `exists: false` | ✓ | `delete` |
| `exists: true` | ✗ | — |
| `gt/gte/lt/lte` | ✗ | — |
| `matches` | ✗ | — |
| `all: […]` | iff all children | union of child writes |
| `any: […]` | ✗ | — |
| `not: { exists: true }` | ✓ | `delete` |
| `not: <other>` | ✗ | — |

## Fractional-index alphabet

Base-62, ASCII lexicographic order:  
`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`

**Invariant:** no generated key ends with `'0'`. This guarantees infinite
divisibility: for any two distinct valid keys `lo < hi` there is always a
key strictly between them.

## Lazy boards-entry creation (consumer responsibility)

When `deriveMutations` returns mutations whose paths target
`boards.<slug>.*`, the **calling code** is responsible for ensuring the
item has a `boards[]` entry for that slug. If absent, the provider should
upsert the entry when applying the mutations.

`deriveMutations` does not check the item; it works purely from the
filter structure and context.

## Dependencies

- `@awesome-markdown/contracts` — all filter, mutation, and item types.

No other runtime dependencies. `zod` is not imported at runtime (types only
flow from the contracts package).
