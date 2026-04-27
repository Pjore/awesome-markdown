# Verification Guide

## Overview

Two verification strategies are used:

| Strategy | Tool | Scope |
|----------|------|-------|
| UI verification | `agent-browser` (LLM-driven browser automation) | UI milestones: M3, M5, M8, M9 |
| Non-UI verification | Vitest | Sidecar API, sync-engine internals, provider unit tests |

---

## UI Verification — agent-browser

`agent-browser` drives the running `kanban-ui` dev server in a real browser and asserts user-visible outcomes (DOM state, visible text, navigation).

### Scenario layout

Each UI milestone owns a directory under `apps/kanban-ui/agent-browser/`:

```
apps/kanban-ui/agent-browser/
  m3/   board render, DnD, CRUD
  m5/   runtime provider switch, SSE indicator
  m8/   conflict banner + resolution flow
  m9/   board list, navigation, deep-link
```

Each `*.scenario.json` file defines:

- `id` — unique identifier
- `description` — what is being tested
- `services` — which processes must be running
- `seed` — optional `?seed=` param to load a deterministic board state
- `actions` — ordered user interactions
- `assertions` — DOM-level checks that must pass

### Per-milestone commands

```bash
pnpm --filter kanban-ui verify:m3   # M3: board + DnD scenarios
pnpm --filter kanban-ui verify:m5   # M5: provider switch + SSE indicator
pnpm --filter kanban-ui verify:m8   # M8: conflict resolution UI
pnpm --filter kanban-ui verify:m9   # M9: multi-board routing
```

Each command validates scenario descriptors and prints a pass/fail summary. In a full CI environment the runner invokes agent-browser against a running dev server.

### Seed flag

Append `?seed=m3` to the dev server URL to load a deterministic board (2 swimlanes × 3 columns × 6 items) without manual setup:

```
http://localhost:5173/?seed=m3
```

---

## Aggregate UI Smoke Suite

`pnpm verify:ui` runs all per-milestone agent-browser verifications in sequence:

```bash
pnpm verify:ui
```

This executes `verify:m3 → verify:m5 → verify:m8 → verify:m9` against a wired stack (kanban-ui + provider-fs + sync-engine).

**Stack to start before running `verify:ui`:**

```bash
# Terminal 1
pnpm --filter kanban-ui dev

# Terminal 2
pnpm --filter provider-fs dev

# Terminal 3
SYNC_ENGINE_REPO_ROOT=$(pwd) pnpm --filter sync-engine dev
```

---

## Non-UI Verification — Vitest

Non-UI components are verified by Vitest suites that run without a browser.

## Running Tests

```bash
# localStorage provider — CRUD round-trip + subscription fan-out
pnpm --filter @awesome-markdown/provider-localstorage test

# provider-fs sidecar — HTTP/SSE endpoints against a temp content/ dir
pnpm --filter provider-fs test

# sync-engine — watcher, git commits, remote pull/push, offline retry
pnpm --filter sync-engine test

# All suites
pnpm test
```

### Sync-engine test fixtures

Tests spin up real temp git repositories under `os.tmpdir()`. A local bare repo acts as the remote — no real GitHub access needed. Key fixtures: `test/fixtures/bare-remote.ts` (bare-repo remote) and `test/fixtures/engine-harness.ts` (full engine instance).

---

## Coverage Matrix

| Milestone | Behavior verified | Tool | Command |
|-----------|------------------|------|---------|
| M2 (localStorage) | CRUD round-trip, subscription fan-out | Vitest | `pnpm --filter @awesome-markdown/provider-localstorage test` |
| M3 (board UI) | board renders, DnD, CRUD via UI | agent-browser | `verify:m3` |
| M4 (fs sidecar) | HTTP/SSE provider contract, temp content dir | Vitest | `pnpm --filter provider-fs test` |
| M5 (provider switch) | runtime switch via settings, SSE indicator | agent-browser | `verify:m5` |
| M6/M7 (sync-engine) | watcher → commit → push/pull, offline retry | Vitest | `pnpm --filter sync-engine test` |
| M8 (conflict UI) | conflict banner, ours/theirs/open externally | agent-browser | `verify:m8` |
| M9 (multi-board) | board list, navigation, deep-link | agent-browser | `verify:m9` |

---

## Definition of "Verified Working"

- **UI milestones:** green `agent-browser` run on a clean checkout.
- **Non-UI milestones:** green Vitest run on a clean checkout.
- No manual steps — both verification strategies are fully reproducible from a documented command.
