# Ordering and fractional keys

An axis declares its sort target and direction:

```yaml
order:
  by: boards.$board.order
  direction: asc
```

The column's order takes precedence, then the swimlane's order. Missing/equal values fall back to `updatedAt` descending. String comparison is lexicographic; numbers use numeric comparison.

## Choosing a target

The configured property defines the storage location. Examples:

- `order` for a global item value.
- `boards.$board.order` for one board's selected group.
- `boards.$board.axes.$axis.order` for a nested axis group.

These are ordinary item properties. The axis definition selects their interpretation for sorting.

## Manual reorder

Manual fractional-key ordering uses a configured ascending string target with compatible current/neighbor values. Reordering writes that single selected target. Cross-cell placement uses the destination's bound rules and applies its compatible ordering write in the same atomic update.

Implementation: `packages/filter-engine/src/order-keys.ts`.

- Alphabet: `0-9`, `A-Z`, `a-z`, in ASCII order.
- `keyBetween(lo?, hi?)` generates a string strictly between its neighbors; an omitted bound represents an open end.
- Generated keys end in a character above `0`, supporting further insertions.
- Existing neighboring keys remain unchanged when inserting.

Quote keys when authoring YAML so they remain text:

```yaml
boards:
  - board: board-main
    order: "aP"
```

Use `keyBetween` for authored insertions. Preserve the selected list group's identity and use the exact source revision for the resulting mutation batch.
