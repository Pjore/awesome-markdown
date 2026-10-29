# Verification Guide

## Repository gates

From the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:ui
pnpm --filter kanban-ui build
```

Vitest covers contracts, shared filter/mutation/render rules, both providers, filesystem source integrity and synchronization. Shared provider cases live in `scripts/tests/item-provider-conformance.ts`; fixtures use temporary storage/content/git repositories.

## Focused suites

```bash
pnpm --filter @awesome-markdown/contracts test
pnpm --filter @awesome-markdown/filter-engine test
pnpm --filter @awesome-markdown/core test
pnpm --filter @awesome-markdown/provider-localstorage test
pnpm --filter @awesome-markdown/provider-http test
pnpm --filter @awesome-markdown/board-ui test
pnpm --filter provider-fs test
pnpm --filter sync-engine test
```

Inspect metadata-only and heterogeneous items, literal keys, contextual selectors in both dimensions, complete-batch validation, protected metadata, source bounds and stale/deleted/competing writes. UI unit tests cover read/edit sessions, numeric input, list-entry state, Save/Cancel and recovery failures.

## Browser verification

Scenario descriptors live under `apps/kanban-ui/agent-browser/m3`, `m5`, `m8` and `m9`. Descriptor validation:

```bash
pnpm verify:ui
```

Actual M3 browser execution uses `agent-browser`, a running UI and provider-fs against temporary content. Example service setup in separate terminals:

```bash
pnpm typecheck
PROVIDER_FS_CONTENT_ROOT=/absolute/path/to/temporary-content \
PROVIDER_FS_PORT=7713 pnpm --filter provider-fs dev
```

```bash
KANBAN_UI_PORT=5183 \
PROVIDER_FS_PROXY_TARGET=http://127.0.0.1:7713 \
pnpm --filter kanban-ui dev
```

Run the live extension from the repository root:

```bash
UI_URL=http://127.0.0.1:5183 PROVIDER_URL=http://127.0.0.1:7713 \
node apps/kanban-ui/agent-browser/m3/runner.mjs --live
```

It exercises localStorage and HTTP/filesystem, preserves active snapshots during incoming changes, checks conflicts and numeric errors, downloads current YAML/full-Markdown drafts, and scrolls desktop/mobile layouts to the bottom actions. Its own temporary item is cleaned up; screenshots/downloads are written under `/tmp`.

For manual checks, select localStorage and load `http://localhost:5183/?seed=m3`, then open either demo board. The two boards reuse contextual axes and show independent board-specific values on shared items. Use real pointer movement for drag/drop and confirm configured writes and one atomic update per drop.

## Home and deployment verification

Inspect the declared Home binding and its installed package metadata, then run:

```bash
home board connection --task task-slug
home board board
home board axes
home board list
home board get task-slug
steward status
```

Confirm the intended remote URL/board, installed provider version, `itemProtocol: 2` and HTTP 200 for actual board/item reads. Configuration changes through `home board rows --repo REPO` should preserve existing rows and return the added/reused/created axes. Read back the selected board and its repo filters.

Use a legitimate intended task mutation for write verification, retaining its exact snapshot revision when planned. Keep backups private and compare document text and unrelated fields after approved structural changes.

Release checks cover the reviewed Git SHA, applicable CI, published registry versions, container builds, deployment completion and current remote responses. Dokploy builds provider-fs and kanban-ui from the same checkout. Apply approved Home package changes through declarations and Steward reconciliation, then recheck the installed binding.

## Synchronization and webhooks

Sync-engine tests use isolated local git repositories. For live GitHub synchronization, configure the intended repository/target branch, GitHub App credentials and `SYNC_ENGINE_REMOTE_ENABLED=true`, then start the services through `scripts/services`.

Webhook verification:

```bash
curl -X POST http://localhost:7402/webhooks/github \
  -H "Content-Type: application/json" -d '{}'
```

Expected signature result is HTTP 401 with `{"ok":false,"reason":"signature"}`. Valid target-branch pushes queue a pull with HTTP 202; other-branch pushes are acknowledged as ignored; ping events return the ping acknowledgment. Verify the resulting current content and synchronization state.
