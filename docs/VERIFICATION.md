# Verification Guide

## Overview

awesome-markdown uses two verification strategies:

| Strategy | Tool | Scope |
|---|---|---|
| UI verification | Browser automation runner (`agent-browser`) | User-visible flows in `kanban-ui` |
| Non-UI verification | Vitest | Provider, filter-engine, and sync-engine behavior |

## UI verification

The browser automation suite drives a running `kanban-ui` instance and checks visible outcomes such as navigation, rendered cards, drag-and-drop behavior, and conflict UI.

Scenario files live under `apps/kanban-ui/agent-browser/`:

```text
apps/kanban-ui/agent-browser/
  m3/   board render, drag-and-drop, CRUD
  m5/   runtime provider switch, SSE indicator
  m6/   writable drop, read-only rejection, homeless panel
  m8/   conflict banner and resolution flow
  m9/   board list, navigation, deep-linking
```

Run milestone suites with:

```bash
pnpm --filter kanban-ui verify:m3
pnpm --filter kanban-ui verify:m5
pnpm --filter kanban-ui verify:m6
pnpm --filter kanban-ui verify:m8
pnpm --filter kanban-ui verify:m9
```

Run the aggregate UI suite with:

```bash
pnpm verify:ui
```

Start the local stack before running UI verification:

```bash
pnpm --filter kanban-ui dev
pnpm --filter provider-fs dev
SYNC_ENGINE_REPO_ROOT=$(pwd) pnpm --filter sync-engine dev
```

You can append `?seed=m3` to the UI URL to load a deterministic board state during manual checks:

```text
http://localhost:5173/?seed=m3
```

## Non-UI verification

Run the main automated suites with:

```bash
pnpm --filter @awesome-markdown/provider-localstorage test
pnpm --filter provider-fs test
pnpm --filter sync-engine test
pnpm test
```

Sync-engine tests use local temporary git repositories and do not require real GitHub access.

## Coverage matrix

| Milestone | Behavior verified | Tool | Command |
|---|---|---|---|
| M2 | localStorage CRUD and subscriptions | Vitest | `pnpm --filter @awesome-markdown/provider-localstorage test` |
| M3 | board rendering, drag-and-drop, CRUD via UI | Browser automation | `pnpm --filter kanban-ui verify:m3` |
| M4 | filesystem provider API and SSE contract | Vitest | `pnpm --filter provider-fs test` |
| M5 | runtime provider switching and SSE indicator | Browser automation | `pnpm --filter kanban-ui verify:m5` |
| M5/M6 | filter evaluation and invertibility | Vitest | `pnpm --filter @awesome-markdown/filter-engine test` |
| M6/M7 | sync-engine watcher, pull/push, offline retry | Vitest | `pnpm --filter sync-engine test` |
| M8 | conflict resolution UI | Browser automation | `pnpm --filter kanban-ui verify:m8` |
| M9 | multi-board routing and deep-linking | Browser automation | `pnpm --filter kanban-ui verify:m9` |

## Webhook validation

The GitHub webhook flow has both automated tests and a live end-to-end procedure.

### Unit tests

```bash
pnpm --filter sync-engine test
```

### Live validation

Prerequisites:

1. `apps/sync-engine/.env` configured with GitHub App credentials, webhook secret, and `SYNC_ENGINE_REMOTE_ENABLED=true`
2. The GitHub App installed on the target repository with **Contents: Read and write** and `push` event delivery enabled
3. Services running via `./scripts/services start`

Example webhook URL pattern for a forwarded Coder workspace port:

```text
https://7402--<agent>--<workspace>--<owner>.coder.example.com/webhooks/github
```

Validation steps:

```bash
curl -X POST http://localhost:7402/webhooks/github \
  -H "Content-Type: application/json" -d '{}'
# expected: {"ok":false,"reason":"signature"}
```

A successful live setup should return:

| Event | Expected status |
|---|---|
| `push` on target branch | `202` with `{ok:true,action:"queued"}` |
| `push` on another branch | `202` with `{ok:true,action:"ignored",reason:"branch"}` |
| `ping` | `202` with `{ok:true,action:"ping"}` |
| bad signature | `401` with `{ok:false,reason:"signature"}` |

## Definition of verified working

- UI changes have a passing browser automation run against a clean checkout.
- Non-UI changes have a passing Vitest run against a clean checkout.
- Reproduction steps are documented and repeatable.
