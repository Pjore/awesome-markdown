# Milestone 1: Contracts realignment

## Metadata
- Parent plan: [markdown-driven-domain-main.md](markdown-driven-domain-main.md)
- Complexity / Work: 3 / 3
- Depends on: none
- Use cases: type surface for UC-1, UC-2, UC-3, UC-4, UC-5, UC-7

## Objective
Replace the existing board/column/swimlane/item schemas in
[packages/contracts](../packages/contracts) with the new `entityType`-discriminated
entity model (`item`, `board`, `axis`), introduce a recursive filter-rule schema,
a mutation-list schema, and the board-render + homeless-items DTO shapes that
downstream packages will consume. After this milestone, every other layer can
typecheck against the new contracts even though no behavior is wired up yet.

## Scope

**In:**
- New Zod schemas under [packages/contracts/src/schemas/](../packages/contracts/src/schemas/)
  for `item`, `board`, `axis`, discriminated by `entityType`.
- Recursive filter-rule schema covering all leaf operators (`equals`, `in`,
  `has`, `lacks`, `exists`, `gt`/`gte`/`lt`/`lte`, `matches`) and boolean
  composition (`all`, `any`, `not`), used uniformly by board / column / swimlane.
- Mutation-list schema with `set` / `append` / `remove` / `delete` variants,
  each carrying a single dotted `path` field; `writeOnDrop` axis override
  (mutation list with mutually-exclusive `readonly: true` form).
- Dotted-path string schema with documented escaping rule for slugs that
  contain `.` (resolves the open question in §9 of the main plan).
- DTO schemas for `BoardRender` (board + axes + cells, with `synthetic` flag
  on fallback axes and `readOnly` on cells) and `Homeless` response.
- `PATCH /items/:slug` request body schema (mutation list) and `POST /items`
  request body schema.
- Updated [packages/contracts/src/index.ts](../packages/contracts/src/index.ts)
  exports: schemas, inferred types, and DTO types only.
- Vitest acceptance/rejection tests for each schema with representative
  fixtures.
- Removal of obsolete files in [packages/contracts/src/schemas/](../packages/contracts/src/schemas/)
  (`board.ts`, `column.ts`, `swimlane.ts`, current `item.ts`) and any
  obsolete exports/DTOs in [dtos.ts](../packages/contracts/src/dtos.ts),
  [provider.ts](../packages/contracts/src/provider.ts),
  [events.ts](../packages/contracts/src/events.ts),
  [conflict.ts](../packages/contracts/src/conflict.ts).

**Out:**
- Filter evaluation, invertibility analysis, and mutation derivation logic
  (M2 — `packages/filter-engine`). Define only the shapes the engine
  consumes/produces; do not import or implement runtime semantics here.
- Fractional-index helpers / comparison logic (M2). Order keys are typed
  as opaque strings at the contract layer.
- Any provider, HTTP client, or UI changes (M3+).
- Migration shims, deprecation aliases, or back-compat re-exports.
- Runtime path parsing or `$board` substitution (M2 consumer concern;
  contracts only validate path strings shape).
- Authoring or editing of demo content under `content/` (M6).

## Constraints
- Zod v4 only; import from `"zod"`. Use discriminated unions for
  `entityType` and for mutation variants.
- No `any` and no `z.unknown()` escape hatches in entity property schemas
  beyond what the outline's grammar allows.
- Each TS source file ≤ 400 lines; split the filter-rule schema and
  mutation schema into their own files under `src/schemas/` if needed.
- Recursive filter-rule schema must use `z.lazy` (or v4 equivalent) so
  `all` / `any` / `not` can nest arbitrarily; inferred type must be a
  proper recursive type (no `any`).
- Schemas must be the single source of truth: every exported type is
  inferred from a schema (`z.infer`), not hand-declared.
- Slug fields are namespaced per `entityType`; do not enforce global
  uniqueness in the schema (that is a provider-index concern).
- Order keys (`order`, `boards.$board.order`) are typed as non-empty
  strings; lexicographic semantics belong to M2.

## Contracts (cross-package shapes fixed here)
- `Item` / `Board` / `Axis`: discriminated union on `entityType`; each
  carries `slug` and the entity-specific frontmatter described in the
  outline §2. `Item.boards` is a record keyed by board slug carrying at
  minimum `order` plus arbitrary per-board property bag values typed
  against the property-value schema.
- `FilterRule`: recursive node — either a leaf operator object keyed by
  a single dotted path, or `{ all: FilterRule[] }` / `{ any: FilterRule[] }`
  / `{ not: FilterRule }`. Consumed by board, axis, and (via composition)
  the filter-engine in M2.
- `Mutation`: discriminated union over `set` / `append` / `remove` /
  `delete`, each with a `path` field. List form is the PATCH body.
- `WriteOnDrop`: `Mutation[]` OR `{ readonly: true }`; the two forms are
  mutually exclusive at the schema level.
- `BoardRender`: `{ board, axes: { columns: Axis[], swimlanes: Axis[] },
  cells: Cell[] }`; `Cell` carries `columnSlug`, `swimlaneSlug`,
  `readOnly: boolean`, `items: Item[]`. Synthetic axes carry
  `synthetic: true` and may omit `filter` / `order` / `writeOnDrop`.
- `Homeless`: `{ board: Board, items: Item[] }`.
- Dotted-path string: segments separated by `.`; a literal `.` inside a
  slug segment is escaped per the rule chosen in this milestone (decide
  between backslash-escape `\.` or bracketed segment `["a.b"]` — pick
  one, document it in the schema's JSDoc, and enforce it via regex/refinement).

## Definition of Done
- [ ] Old schema files removed; no obsolete exports remain in
      `packages/contracts`.
- [ ] All new schemas exported from
      [packages/contracts/src/index.ts](../packages/contracts/src/index.ts);
      `z.infer` types exported alongside.
- [ ] Recursive `FilterRule` infers as a proper recursive TS type; a
      type-level test (or `expectTypeOf`) confirms nesting compiles.
- [ ] Vitest acceptance fixtures pass for: a minimal item, a multi-board
      item with per-board property bags, a board with and without
      `B.filter`, an axis with each leaf operator, an axis using each
      boolean composition node, an axis with `writeOnDrop` mutations,
      an axis with `writeOnDrop: { readonly: true }`, a synthetic-axis
      render envelope, a homeless response.
- [ ] Vitest rejection fixtures cover: missing `entityType`, unknown
      `entityType`, mixed `writeOnDrop` (mutations + `readonly`), empty
      `all` / `any` arrays (decide and enforce), `in: []`, malformed
      dotted paths, mutation with conflicting variant keys.
- [ ] Dotted-path escaping rule documented in schema JSDoc and exercised
      by at least one acceptance and one rejection test.
- [ ] `pnpm --filter @awesome-markdown/contracts typecheck` passes.
- [ ] `pnpm --filter @awesome-markdown/contracts test` passes.
- [ ] Workspace-root `pnpm typecheck && pnpm lint` build does **not**
      need to pass yet — downstream consumers will be updated in
      subsequent milestones. Note this explicitly in the PR description.

## Risks & Decisions To Get Right
- **Recursive Zod typing:** use `z.lazy` with an explicitly declared
  recursive type alias. A naive recursive schema infers as `any` and
  silently breaks the no-`any` rule.
- **Discriminated unions over loose objects:** model `entityType` and
  mutation variants as discriminated unions, not `z.object` with
  optional fields, so exhaustive narrowing works downstream.
- **Empty boolean nodes:** reject `all: []` / `any: []` at schema time;
  surfacing the failure here is cheaper than at evaluation time in M2.
- **Path escaping decision is permanent:** picking `\.` vs `["…"]` will
  be baked into every entity file authored in M6 and every UI mutation
  in M5. Pick the simpler option (single rule, one regex) and lock it.
- **Don't anticipate M2:** resist adding helper functions, parsed-path
  types, or invertibility flags. Contracts ship validators and types
  only.
- **`writeOnDrop` exclusivity:** model the readonly form and the
  mutation-list form as a discriminated union so consumers cannot
  observe an "impossible" mixed value.

## Open Questions
- None blocking. Path escaping is resolved within this milestone per
  the Risks section.
