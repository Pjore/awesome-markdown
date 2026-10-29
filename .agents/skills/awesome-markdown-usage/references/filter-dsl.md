# Filter DSL

A filter is a leaf object or a recursive `all`, `any` or `not` object. `all`/`any` contain nonempty lists of rules.

```yaml
filter:
  property: boards.$board.board
  equals: board-main
```

```yaml
filter:
  all:
    - property: boards.$board.column
      equals: todo
    - property: repo
      equals: awesome-markdown
```

In the UI condition builder, enter Property, Operator and Value as separate fields. The `equals` operator is labeled **is**.

## Operators

| Operator | Value | Meaning | Derived write |
|---|---|---|---|
| `equals` | string, number, boolean | exact equality | set |
| `in` | nonempty string/number list | any listed value | set for a single value |
| `has` | string/number | list contains value | append |
| `lacks` | string/number | list excludes value | remove |
| `exists` | boolean | present/absent property | delete for false |
| `gt`, `gte`, `lt`, `lte` | string/number | scalar comparison | explicit override for writable placement |
| `matches` | regex string | text matches | explicit override for writable placement |

`all` combines every rule and its derived writes. `any` selects any matching rule. `not` negates a rule; `not: { property: ..., exists: true }` derives deletion. Use invertible board filters and axis overrides where writable placement is desired.

## Contextual paths

Dots separate configuration-path segments. Escape a literal dot with `\.` and a literal backslash with `\\`. Structural paths use literal string keys and numeric indices.

`$board` selects a list group whose `board` equals the current board slug. `$axis` selects by `axis` and binds to the current axis definition. List property names are ordinary names:

```yaml
filter:
  property: boards.$board.axes.$axis.axis
  equals: axis-doing
order:
  by: boards.$board.axes.$axis.order
  direction: asc
```

Bind column and swimlane expressions separately. The board filter has board context. Selector identity remains explicit in bound writes, even when board and axis slugs are identical.

Missing matches resolve to a missing value, distinct from null. List lookup considers mapping entries with the selected identity key. Duplicate matches or incompatible containers produce an actionable lookup error identifying the item. Inspect that item's structure and the configured path before making a deliberate correction.

## Projection

The board filter selects candidates. Column and swimlane filters select cells from those candidates. `/homeless` contains candidates matching no column. Writability follows the board rule plus each dimension's derived or explicit writes.

Schemas: `packages/contracts/src/schemas/filter-rule.ts`. Resolution and binding: `packages/filter-engine/src/path-resolver.ts`.
