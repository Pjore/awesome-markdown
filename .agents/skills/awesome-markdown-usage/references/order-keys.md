# Fractional-index order keys

Implementation: `packages/filter-engine/src/order-keys.ts`.

- Alphabet: 62 chars, ASCII order — `0-9` < `A-Z` < `a-z`. Plain string comparison (`<`, `>`) is a correct comparator (`compareOrderKeys` just wraps this).
- `keyBetween(lo?, hi?)` generates a key strictly between two existing keys (or at an open end when one/both are omitted). Never renumber neighbors to make room — always synthesize a new key between the two cards you're inserting between.
- Invariant: no generated key ends in `'0'` (the lowest char) — this guarantees there's always room to insert something even lower without hitting a degenerate case.
- Keys are plain strings in YAML frontmatter — no quoting/escaping concerns, but write them as quoted strings (e.g. `order: 'c0V'`) if they could be interpreted as another YAML scalar (they usually can't, since the alphabet mixes cases and digits).

## Where order keys live

- `item.order` — global order key (board-agnostic), used when a board/axis doesn't scope by board.
- `item.boards[].order` — per-board order key on the matching `boards[]` entry, resolved via the `boards.$board.order` dotted path (see `path-resolver.ts`'s array-lookup-by-`board`-field behavior).

Axes commonly declare `order: { by: boards.$board.order, direction: asc }` so cards sort by their per-board position within that axis bucket. When no `order` rule is set on an axis, sort falls back to `updatedAt desc`.

## Hand-authoring a key

If you need to manually insert an item between two existing cards with keys `lo` and `hi` in the same cell, pick something string-between them (e.g. between `'A'` and `'C'` use `'B'`). Don't guess — when in doubt call `keyBetween(lo, hi)` rather than eyeballing it, since the "avoid trailing `0`" invariant has non-obvious recursive cases for keys that share a prefix.
