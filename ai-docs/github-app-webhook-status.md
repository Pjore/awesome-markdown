# Implementation Status: github-app-webhook

## Overview
- **Plan:** ai-docs/github-app-webhook-main.md
- **Started:** 2026-04-28T00:00:00Z
- **Updated:** 2026-04-28T01:00:00Z
- **Status:** completed

## Use Case Coverage

| Use Case | Layers Implemented | Integration | Notes |
|----------|-------------------|-------------|-------|
| UC-1 | sync-engine (http, engine, github-app) | verified | webhook→verify→filter→triggerPullNow→pull→SSE |
| UC-2 | sync-engine (config, engine) | verified | pullIntervalMs default 600 000 ms, min 60 000 ms |
| UC-3 | sync-engine (config, engine) | verified | no App vars → remote.enabled=false, no webhook |
| UC-4 | sync-engine (github-app token cache) | verified | < 5 min to expiry → auto-refresh; mint failure → 'auth' |

## Execution Waves

| Wave | Milestones | Status | Started | Completed |
|------|------------|--------|---------|-----------|
| 1 | M1 | completed | 2026-04-28T00:10:00Z | 2026-04-28T00:30:00Z |
| 2 | M2, M3 | completed | 2026-04-28T00:30:00Z | 2026-04-28T01:00:00Z |

## Milestone Progress

| # | Milestone | Wave | Status | Notes |
|---|-----------|------|--------|-------|
| 1 | GitHub App auth & installation-token cache | 1 | completed | 17 test files, 100 tests |
| 2 | Webhook receiver & immediate-pull trigger | 2 | completed | +32 new tests (132 total) |
| 3 | Polling cadence change & cleanup | 2 | completed | No dedicated milestone file; used main plan description |

## Sub-Agent Reports

### Wave 1
#### Milestone 1: GitHub App auth & installation-token cache
- **Status:** success
- **Files changed:** 25 files (new github-app/ module, config updates, test suite)
- **Deviations:** None
- **Tests:** 17 files, 100 tests all passing
- **Key commits:** feat(sync-engine): add GitHub App credential provider module; docs(sync-engine): replace PAT docs with GitHub App registration guide; test(sync-engine): update harness and add GitHub App unit tests

### Wave 2
#### Milestone 2: Webhook receiver & immediate-pull trigger
- **Status:** success
- **Files changed:** webhook-routes.ts, webhook-signature.ts, engine.ts (triggerPullNow), server.ts, config.schema.ts, 4 new test files, README updated
- **Deviations:** Used plain Fastify function pattern instead of FastifyPluginAsyncZod (fastify-type-provider-zod not installed)

#### Milestone 3: Polling cadence change & cleanup
- **Status:** success
- **Files changed:** config.schema.ts (pullIntervalMs min/default raised), README, copilot-instructions.md, github-app.config.test.ts (2 tests updated)
- **Deviations:** None

## Acceptance Criteria

| Criterion | Status | Verified | Notes |
|-----------|--------|----------|-------|
| `pnpm typecheck && pnpm lint` pass | completed | yes | 0 errors, 9 pre-existing warnings |
| All existing sync-engine Vitest suites pass | completed | yes | 132/132 tests, 20 files |
| New tests: signature verification (good/bad/missing) | completed | yes | webhook.signature.test.ts (12 tests) |
| New tests: event filtering (push on target/other/non-push) | completed | yes | webhook.routes.test.ts (11 tests) |
| New tests: App token minter (cache hit/expiry/mint failure) | completed | yes | github-app.token.test.ts (6 tests) |
| New tests: polling-cadence floor | completed | yes | github-app.config.test.ts updated |
| Manual e2e: push triggers UI change within 5 s | pending | - | Requires live GitHub App + Coder proxy URL; manual operator step |
| README documents GitHub App setup & new env vars | completed | yes | apps/sync-engine/README.md |
| `GITHUB_TOKEN` removed from .env.example, runtime config, code | completed | yes | Confirmed via grep: only in .env (gitignored) |
