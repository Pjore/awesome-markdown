# @awesome-markdown/core

Backend-agnostic domain logic for awesome-markdown: board rendering, homeless
detection, mutation application, and markdown (de)serialization of entities.
Extracted from `apps/provider-fs` so any backend (filesystem, Postgres, …)
produces byte-identical `/render` and `/homeless` responses.

## Entry points

### `@awesome-markdown/core` — isomorphic

No Node-only or browser-only APIs.

```ts
import {
  renderBoard,      // ({ board, lookupAxis, items }) → BoardRender
  computeHomeless,  // ({ board, lookupAxis, items }) → Homeless
  applyMutations,   // (item, mutations, now?) → Item (new object, updatedAt = now)
  isCellReadOnly,   // (boardFilter, columnAxis, swimlaneAxis) → boolean
  sortItems,        // (items, axisOrder, ctx) → Item[] (axis order, then updatedAt desc)
  syntheticAxis,    // (slug) → Axis (filterless fallback, synthetic: true)
  compareScalars,
} from '@awesome-markdown/core';

const render = renderBoard({
  board,
  lookupAxis: slug => axesBySlug.get(slug), // undefined → synthetic axis
  items,                                    // the whole item pool
});
```

`lookupAxis` returns `undefined` for slugs without a definition; the renderer
substitutes `syntheticAxis(slug)`. Empty `columns`/`swimlanes` fall back to the
implicit "All" axis (`resolveDimension` from contracts).

### `@awesome-markdown/core/markdown` — Node

Uses `gray-matter`, which depends on Node built-ins.

```ts
import { serializeEntity, parseEntity, parseEntityResult } from '@awesome-markdown/core/markdown';

serializeEntity(item);              // frontmatter + body (items) / frontmatter only (boards, axes)
parseEntity(markdown, 'x.md');      // ParsedEntity | null — logs invalid files via console.warn
parseEntityResult(markdown);        // { ok: true, entity } | { ok: false, reason, message }
```

`reason` is one of `frontmatter | no_entity_type | invalid | unknown_entity_type`
— useful for import reports.

## Golden fixtures

`test/golden/<board>.{render,homeless}.json` are the wire responses for every
board in the repo's `content/` directory. Both this package and
`apps/provider-fs` assert against them. After an intentional `content/` change,
regenerate with `pnpm --filter @awesome-markdown/core test -u` and review the
diff.
