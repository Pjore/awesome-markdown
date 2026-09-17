# Filter DSL reference

Schema: `packages/contracts/src/schemas/filter-rule.ts`. A `FilterRule` is recursive: a leaf, or `{ all: FilterRule[] }` / `{ any: FilterRule[] }` (both non-empty) / `{ not: FilterRule }`.

## Leaf operators

| Op | Shape | Value type | Meaning | Invertible? |
|---|---|---|---|---|
| `equals` | `{ property, equals }` | string \| number \| boolean | exact match | yes → `set path = value` |
| `in` | `{ property, in: [...] }` | array of string\|number, min 1 | value is one of the list | only if `in` has exactly 1 element → `set` |
| `has` | `{ property, has }` | string \| number | array property contains value | yes → `append path value` |
| `lacks` | `{ property, lacks }` | string \| number | array property excludes value | yes → `remove path value` |
| `exists` | `{ property, exists: bool }` | boolean | property is present/absent | only `exists: false` → `delete path`. `exists: true` is never invertible |
| `gt` / `gte` / `lt` / `lte` | `{ property, gt }` etc. | string \| number | comparator | never invertible |
| `matches` | `{ property, matches }` | string (regex) | regex test | never invertible |

## Composition

- `all: [rules]` — AND. Invertible iff every child is invertible (mutations are the union of each child's derived mutation).
- `any: [rules]` — OR. **Never invertible**, regardless of children — this is the most common reason a cell/column/swimlane is read-only. Example: the `status-done` axis's filter is `{ any: [{ property: status, equals: done }, { property: status, equals: complete }] }`, making both `board-all`'s `status-done` column and `board-dev`'s `status-done` swimlane read-only.
- `not: rule` — invertible **only** when wrapping `{ property, exists: true }` (produces `delete path`). Any other negation is non-invertible — there's no general way to invert "does not equal X" etc.

Strict policy: invertibility poisons upward. One non-invertible leaf anywhere in the tree makes the whole combined filter (and thus the whole cell) read-only. There is no partial/best-effort inversion.

## Dotted paths

Grammar: segments separated by `.`; a literal dot inside a segment is escaped as `\.`. Regex: `^(?:[^.\\]|\\.)+(?:\.(?:[^.\\]|\\.)+)*$`.

`$board` is a reserved segment name substituted with the current board's slug during evaluation/mutation (`packages/filter-engine/src/path-resolver.ts`):

- In a normal object path, `$board` is just replaced with the literal board slug string before lookup.
- When the path resolution encounters an array value (e.g. `item.boards`) and the next segment is a key, it instead searches the array for an entry whose `board` field equals that key — this is how `boards.$board.order` resolves to the matching `boards[]` entry's `order` field instead of doing a plain object-key lookup.

Missing intermediate keys resolve to `undefined` (never throws); `undefined` and `null` are distinct values for `exists` checks.

## Where filters apply

A rendered cell's effective filter is the AND of: board's own `filter` (candidate-set scoping, evaluated first) ∧ the column axis's `filter` ∧ the swimlane axis's `filter`. All three (or fewer, if a board has no swimlanes/base filter) are combined before invertibility is analyzed — a perfectly invertible column filter can still end up read-only if the board or swimlane filter it's paired with isn't.
