# Milestone 3: provider-fs realignment

## Metadata
- Parent plan: [markdown-driven-domain-main.md](markdown-driven-domain-main.md)
- Complexity / Work: 5 / 5
- Depends on: M1 (contracts) and M2 (filter-engine) merged.
- Use cases: UC-1, UC-2, UC-3, UC-4, UC-5, UC-6, UC-7 (server portion).

## Objective
Rebuild `apps/provider-fs` around a flat recursive scan of `content/**/*.md`
backed by an in-memory typed index keyed by `(entityType, slug)`, and expose
the new endpoint set that drives boards-as-queries. Sync-engine and the
existing `/subscribe` SSE channel are not modified.

## Scope

**In:**
- Replace [apps/provider-fs/src/fs/](../apps/provider-fs/src/fs/) with a flat
  scanner + typed in-memory index. Watcher invalidates entries on change.
- Replace [apps/provider-fs/src/routes/](../apps/provider-fs/src/routes/) with
  the endpoint set listed under Contracts. Old board/column/swimlane/item
  routes are deleted, not deprecated.
- Render endpoint composes filter-engine results: applies `B.filter`,
  bucketizes items into `(column, swimlane)` cells, sorts per column rule
  with `updatedAt desc` tiebreak, and synthesizes axes missing definition
  files (`synthetic: true`, `title = slug`, no filter).
- Homeless endpoint returns items whose `boards[]` references the board but
  match no column under `B.filter`.
- PATCH applies the mutation list in a single file write; POST writes one new
  `<slug>.md` with collision suffix; DELETE removes one file.
- Rewrite [apps/provider-fs/test/](../apps/provider-fs/test/) fixtures and
  suites for the new shapes (see Definition of Done).

**Out:**
- Sync-engine: no changes to
  [apps/sync-engine/](../apps/sync-engine/) code or tests.
- SSE protocol: keep wire shape, topic names, and emission points behaviorally
  unchanged. Re-broadcast on writes via the same path used today.
- `provider-localstorage`, `provider-http`, `kanban-ui`: out of scope (M4/M5).
- `GET /lint/untagged` operator endpoint (out of scope per main plan §0).
- Any persistence beyond writing/reading the markdown files.

## Constraints
- Routes use `FastifyPluginAsyncZod` from `fastify-type-provider-zod`; rely on
  Zod schemas to type request/response. No manual `request.body as …` casts.
- Zod v4 only, imported from `"zod"`. All shared shapes come from
  `@awesome-markdown/contracts` and `@awesome-markdown/filter-engine`.
- ESM imports inside provider-fs use the `.js` extension.
- TypeScript source files ≤ 400 lines. No `any` in any cross-package
  surface; internal `any` is also disallowed where a typed alternative exists.
- Files lacking `entityType` frontmatter are silently ignored at scan time
  and at watcher-update time. Parse failures are logged and the file is
  skipped without affecting the rest of the index.
- Slugs uniquely identify entities **within an `entityType`**. Two files
  declaring the same `(entityType, slug)` is a fixture/authoring error;
  log and keep the first scanned, but the integration tests must not rely
  on which one wins.
- Single-file write invariant: every successful POST/PATCH/DELETE touches
  exactly one `.md` file under `content/`. Tests must assert this.
- Filesystem layout under `content/` is arbitrary; new items written by
  POST land at `content/<slug>.md` (root) per outline §5.

## Contracts

- `GET /boards` → array of board summaries (slug, title, description).
- `GET /axes` → array of axis summaries (slug, title, description,
  `synthetic: false`).
- `GET /boards/:slug/render` → `BoardRender` envelope from contracts:
  `{ board, axes: { columns, swimlanes }, cells: [{ columnSlug,
  swimlaneSlug, readOnly, items }] }`. `readOnly` reflects combined-filter
  invertibility per filter-engine. Synthetic axes appear in `axes.columns`
  / `axes.swimlanes` with `synthetic: true`.
- `GET /boards/:slug/homeless` → array of items.
- `GET /items/:slug`, `POST /items`, `PATCH /items/:slug`,
  `DELETE /items/:slug` — DTOs from contracts. PATCH body is a mutation
  list; POST body carries `slug?`, `title`, optional initial mutations,
  and body content.
- Existing `/subscribe` SSE: emission points and payload shape preserved;
  any write that mutates the index re-emits on the same channel.
- Index API (internal): typed lookups `getItem(slug) | getBoard(slug) |
  getAxis(slug)` and an iterator over items. Consumed only inside
  provider-fs; exact shape is the agent's call but must not require
  callers to discriminate untyped unions at use sites.

## Definition of Done
- [ ] Old route files (`boards.ts`, `columns.ts`, `swimlanes.ts`,
      and the pre-existing `items.ts`) and old fs-layer repos
      (`boards-repo.ts`, `columns-repo.ts`, `swimlanes-repo.ts`,
      `items-repo.ts`) are removed; replacement modules implement the
      new surface.
- [ ] Flat scan ignores files without `entityType` and recovers from
      individual parse failures.
- [ ] Watcher updates the in-memory index on add/change/unlink and
      re-emits the existing SSE event on each mutation.
- [ ] `GET /boards/:slug/render` integration coverage for:
      bucketization (item appearing in multiple cells), board-level
      filter narrowing the candidate set, column sort with
      `updatedAt desc` tiebreak, and synthetic-axis (slug-fallback)
      synthesis when an axis definition file is absent.
- [ ] `GET /boards/:slug/homeless` integration coverage: an item with a
      `boards[]` entry for B that matches no column is listed; an item
      that matches a column is not; an item without a `boards[]` entry
      for B is not.
- [ ] `PATCH /items/:slug` integration coverage: single-file-write
      assertion (snapshot all `content/**/*.md` mtimes/contents before
      and after; only the target file changes), and SSE broadcast
      observed on the existing channel.
- [ ] `POST /items` integration coverage: slug auto-derivation from
      title, numeric suffix collision (`-2`, `-3`) when a file with that
      slug already exists, single-file-write.
- [ ] Untagged-file ignore: a `.md` file in `content/` lacking
      `entityType` is excluded from `/items`, `/boards`, `/axes`, and
      every render result.
- [ ] Existing SSE subscribe test still passes against the new
      implementation.
- [ ] No source file in `apps/provider-fs/src/` exceeds 400 lines.
- [ ] `pnpm typecheck && pnpm lint` clean; full provider-fs Vitest suite
      green; sync-engine suite untouched and still green.

## Risks & Decisions To Get Right
- **Index invalidation order vs. SSE emit:** update the in-memory index
  *before* re-emitting on `/subscribe`, so subscribers re-fetching see
  post-write state.
- **Synthetic axes are first-class in the response:** do not omit a
  missing axis from `axes.columns` / `axes.swimlanes`; emit a synthetic
  entry so the client can render the column.
- **Combined-filter invertibility lives in filter-engine:** provider-fs
  must call into M2 for `readOnly`, not reimplement the analysis.
- **`boards[]` is property bag only:** never use it for membership in
  render. Membership is `B.filter ∧ X.filter ∧ L.filter` over the item.
- **Filename for new items is `content/<slug>.md`:** do not use a
  per-`entityType` subfolder unless the user has placed existing files
  that way; identity is slug, not path.
- **Watcher debounce:** match the existing watcher's behavior; do not
  introduce a new debounce window that could mask test races.

## Open Questions
- Path syntax for slugs containing dots is resolved in M1; provider-fs
  inherits whatever escaping the contracts schema specifies and must
  not introduce a second convention.
