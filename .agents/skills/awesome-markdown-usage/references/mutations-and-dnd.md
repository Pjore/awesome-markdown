# Drop mutations & writeOnDrop

Engine: `packages/filter-engine/src/mutations.ts` + `invertibility.ts`. Contracts: `packages/contracts/src/schemas/mutation.ts`.

## Mutation shape

Four ops, discriminated by `op`:

- `{ op: 'set', path, value }` — value is `string | number | boolean | null`. Setting `null` clears the property. Derived from `equals` / single-value `in`.
- `{ op: 'append', path, value }` — value is `string | number` only (never an object). Idempotent. Derived from `has`.
- `{ op: 'remove', path, value }` — value is `string | number` only. Idempotent. Derived from `lacks`.
- `{ op: 'delete', path }` — removes the frontmatter key entirely. Derived from `exists: false`.

## Derivation algorithm (`deriveMutations`)

1. If an axis defines `writeOnDrop`, it wins outright:
   - An explicit non-empty `Mutation[]` is used verbatim, **not** merged with the derived list.
   - `{ readonly: true }` forces read-only even if the filter would otherwise invert cleanly.
2. Otherwise, if the combined filter is `undefined` (no constraint), the mutation list is `[]` — dropping here changes nothing.
3. Otherwise, `analyzeInvertibility` runs on the combined filter. If not invertible, the result is `{ readonly: true }`.
4. Otherwise walk the tree: `all` unions each child's derived mutation; a leaf derives one mutation per the table in [filter-dsl.md](./filter-dsl.md); `not { exists: true }` derives a `delete`.

`$board` in any derived path is substituted with the actual board slug (`substitutePath`) before the mutation is handed to a provider — providers never see the literal string `$board`.

## Example: `tag-urgent` axis override

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

The filter alone would only derive `append tags urgent`. The `writeOnDrop` override additionally sets `priority: high` — demonstrating that a drop can prescribe more side effects than the membership filter strictly requires. Use this when dropping into a bucket should also stamp some other field (e.g. auto-assign, auto-tag).

## `boards[]` upsert responsibility

`deriveMutations` documents (but does not implement) a consumer rule: when a derived/override mutation path matches `boards.<slug>.<field>`, the item may not yet have a `boards[]` entry for `<slug>`. The mutation schema has no explicit "create entry" op — applying `set boards.<slug>.<field> = value` to an item with no matching entry must *upsert* one. This is implemented in `apps/provider-fs/src/fs/apply-mutations.ts` and `packages/provider-localstorage/src/index.ts`. When authoring axis `order` rules as `boards.$board.order`, this upsert is what lets a brand-new card get a per-board order key on its first drop.

**Known-fixed gotcha** (PR #24): the upsert used to initialize a missing `boards` field as a plain object keyed by slug instead of an array — corrupting the item schema. If you're writing new mutation-application code, initialize missing `boards` as `[]`, never `{}`.

## Read-only cells in this repo (for reference)

- `board-all`'s `status-done` column and `board-dev`'s `status-done` swimlane both use the `status-done` axis, whose filter is `{ any: [{ property: status, equals: done }, { property: status, equals: complete }] }` — an `any` node, so it's never invertible and both cells are read-only.

Read-only just means the UI won't let you drop a card there; it doesn't affect whether the card is *shown* there (membership is still evaluated normally, only the derived write is blocked).
