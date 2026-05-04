# Milestone 2: Filter engine package

## Metadata
- Parent plan: [markdown-driven-domain-main.md](markdown-driven-domain-main.md)
- Complexity: 4 / Work: 4
- Depends on: Milestone 1 (contracts realignment merged)
- Use cases: UC-2, UC-3, UC-4, UC-7

## Objective
Stand up `packages/filter-engine` as the single isomorphic implementation
of filter evaluation, invertibility analysis, mutation derivation, and
fractional-index ordering. After this milestone, `provider-fs`,
`provider-localstorage`, and `kanban-ui` have a shared, fully tested
substrate to consume in subsequent milestones; nothing yet imports it.

## Scope

**In:**
- New workspace package `packages/filter-engine` registered under
  `pnpm-workspace.yaml`'s existing `packages/*` glob; package name
  `@awesome-markdown/filter-engine`; ESM-only; same TS/Zod/typecheck
  conventions as `packages/contracts`.
- Pure TypeScript implementation with no Node-only APIs (`fs`, `path`,
  `process`, `Buffer`, etc.) and no browser-only APIs (`window`,
  `document`, `localStorage`). Runtime dependency surface limited to
  `@awesome-markdown/contracts` and, if needed, `zod`.
- The exported surface defined in main-plan §5 "Contract:
  filter-engine ↔ providers/UI": `evaluate`, `analyzeInvertibility`,
  `deriveMutations`, `compareOrderKeys`, `keyBetween`, plus the path
  resolver used by all of them.
- All leaf operators and boolean composition rules from outline §3.1
  and §3.2, including the strict α invertibility policy from §3.4 and
  the `writeOnDrop` override semantics from §3.5.
- Path resolver supporting dotted access into item frontmatter with a
  single `$board` substitution variable resolved from `ctx`. Handles
  missing intermediate keys without throwing (returns absence, not
  errors).
- Fractional-index helpers: `keyBetween` produces a key strictly
  between its two arguments (either may be omitted for "before first"
  / "after last"); `compareOrderKeys` is a lexicographic comparator
  consistent with `keyBetween`'s ordering.
- Exhaustive Vitest suite (see Definition of Done).

**Out:**
- Any consumer wiring. No edits to `provider-fs`, `provider-localstorage`,
  `provider-http`, or `kanban-ui` in this milestone.
- Filesystem scanning, HTTP, SSE, persistence — none of those concerns
  belong here.
- Body-content filter operators (explicit non-goal in main plan §0).
- Performance tuning beyond "obvious O(n) over filter tree, no
  pathological re-evaluation."
- Caching, memoization, or index structures — leave to consumers.
- A standalone CLI or playground.

## Constraints
- TypeScript source files ≤ 400 lines each (repo-wide rule).
- No `any` anywhere in `packages/filter-engine` (parity with
  `packages/contracts`).
- All filter and mutation types come from `@awesome-markdown/contracts`;
  do not redeclare schemas. If a needed type is missing from contracts,
  surface it as a question rather than inventing it here.
- Package builds with `tsc --build` like `packages/contracts` does;
  it must participate in the workspace `pnpm typecheck` and
  `pnpm test` invocations without additional configuration.
- Strict α invertibility is non-negotiable: any non-invertible part
  of the combined filter forces `{ readonly: true }`. There are no
  partial inverses.

## Contracts
The exported surface is fully specified in main-plan §5 "Contract:
filter-engine ↔ providers/UI". This milestone realizes that contract
verbatim; it does not redefine it. `ctx` carries at minimum the active
`$board` slug; the implementation should accept additional optional
context fields without breaking callers.

## Definition of Done

**Behavior coverage (Vitest):**
- [ ] `evaluate` exercised against representative items for every leaf
      operator in outline §3.1, both matching and non-matching cases,
      including absence-of-property semantics.
- [ ] Boolean composition matrix from §3.2: `all` (empty, single,
      multi-child, mixed truth values), `any`, `not` over each leaf
      shape, and nesting at least two levels deep.
- [ ] `analyzeInvertibility` returns the correct verdict for every
      operator listed in §3.1 and §3.2, with `reasons` populated for
      non-invertible cases (consumers will surface these in tooltips).
- [ ] `all` is invertible iff every child is invertible; one
      non-invertible child poisons the whole tree.
- [ ] `deriveMutations` default path: walking an invertible
      `B.filter ∧ X.filter ∧ L.filter` produces the union of expected
      writes (set / append / remove / delete) per the §3.1 "Inverse
      write" column.
- [ ] `deriveMutations` returns `{ readonly: true }` whenever
      `analyzeInvertibility` says non-invertible, even if a partial
      derivation would have been possible.
- [ ] `writeOnDrop` override handling: the explicit-mutations form
      replaces the derived list; the `readonly: true` form forces
      read-only regardless of base invertibility; mixing
      `readonly: true` with mutation entries is rejected.
- [ ] Path resolver: dotted lookup into nested frontmatter, missing
      intermediates, and `$board` substitution against `ctx.board`;
      verify behavior when `ctx.board` is needed but absent.
- [ ] Lazy `boards[]` entry rule from main-plan §5 UC-3 step 5:
      derivation correctly includes a "create boards entry" mutation
      iff at least one mutation targets `boards.$board.*` and the item
      lacks an entry for `$board`.

**Fractional-index invariants (Vitest):**
- [ ] `keyBetween(a, b)` always returns a key strictly between `a` and
      `b` under `compareOrderKeys`, for: both args present, only `a`,
      only `b`, neither.
- [ ] Repeated insertions between the same two neighbors keep
      producing strictly-between keys without ever needing to
      renumber existing keys.
- [ ] `compareOrderKeys` is a total order consistent with `keyBetween`
      output across at least one randomized/property-style scenario
      (seeded; deterministic).
- [ ] Idempotence: re-sorting an already-sorted list of generated keys
      via `compareOrderKeys` is a no-op.

**Quality gates:**
- [ ] `pnpm --filter @awesome-markdown/filter-engine typecheck` clean.
- [ ] `pnpm --filter @awesome-markdown/filter-engine test` green.
- [ ] Workspace-root `pnpm typecheck && pnpm lint && pnpm test` remain
      green (no regressions in other packages).
- [ ] No new dependencies beyond `zod` and `@awesome-markdown/contracts`
      without justification recorded in the package README.
- [ ] Brief `packages/filter-engine/README.md` describing the exported
      surface and the strict α policy; no consumer wiring instructions
      yet (those land with M3/M4/M5).

## Risks & Decisions To Get Right
- **Strict α, not partial inverses.** When combining invertible and
  non-invertible subtrees, the entire cell goes read-only; do not be
  clever and emit "what we could derive."
- **Fractional-index alphabet choice is durable.** Whatever alphabet
  and base scheme is picked here ships into user content via order
  keys and cannot easily change later. Prefer the well-known
  base-62 / "between strings" approach (see main-plan §10 reference
  link); document the choice in the README.
- **Path resolver must distinguish absence from falsy.** `exists:false`
  semantics depend on this; do not collapse `undefined`, `null`, and
  empty-array into one bucket.
- **`ctx` is small and explicit.** Keep `$board` as the only
  substitution variable. Resist growing context into a general
  template engine.
- **No I/O, ever.** A single accidental `import 'node:path'` would
  break browser consumers in M4/M5; the test suite should fail
  closed if such imports appear (e.g., a smoke test that imports the
  package's entry from a browser-condition resolution, or a lint rule
  / scripted check — pick the lightest viable mechanism).

## Open Questions
- Does the contracts schema for `Mutation` already permit the lazy
  "create boards entry" shape, or does it need a small addition in
  M1's follow-up? Verify against the merged M1 schemas before
  starting; if missing, raise rather than invent.
