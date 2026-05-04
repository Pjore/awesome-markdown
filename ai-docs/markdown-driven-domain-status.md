# Implementation Status: markdown-driven-domain

## Overview
- **Plan:** ai-docs/markdown-driven-domain-main.md
- **Started:** 2026-05-04T00:00:00Z
- **Updated:** 2026-05-04T17:30:00Z
- **Status:** completed (e2e verified, merged)

## Use Case Coverage

| Use Case | Layers Implemented | Integration | Notes |
|----------|--------------------|-------------|-------|
| UC-1 | contracts, filter-engine, provider-fs, provider-localstorage, provider-http, kanban-ui | verified | POST /items with mutation derivation |
| UC-2 | contracts, filter-engine, provider-fs, provider-localstorage, kanban-ui | verified | GET /boards/:slug/render, bucketization, synthetic axes |
| UC-3 | contracts, filter-engine, provider-fs, provider-localstorage, kanban-ui | verified | PATCH /items/:slug, invertibility, read-only cells |
| UC-4 | contracts, filter-engine, provider-fs, kanban-ui | verified | keyBetween + single PATCH for order |
| UC-5 | contracts, filter-engine, provider-fs, provider-localstorage, kanban-ui | verified | GET /boards/:slug/homeless, homeless panel |
| UC-6 | provider-fs | verified | file watcher → SSE broadcast (unchanged) |
| UC-7 | contracts, filter-engine, provider-fs, provider-localstorage, kanban-ui | verified | synthetic: true, title=slug, match-all |

## Execution Waves

| Wave | Milestones | Status | Started | Completed |
|------|------------|--------|---------|-----------|
| 1 | M1, M2 | completed | 2026-05-04T00:05:00Z | 2026-05-04T01:00:00Z |
| 2 | M3 | completed | 2026-05-04T01:00:00Z | 2026-05-04T08:00:00Z |
| 3 | M4 | completed | 2026-05-04T08:00:00Z | 2026-05-04T10:00:00Z |
| 4 | M5 | completed | 2026-05-04T10:00:00Z | 2026-05-04T11:30:00Z |
| 5 | M6, M7 | completed | 2026-05-04T11:30:00Z | 2026-05-04T12:20:00Z |

## Milestone Progress

| # | Milestone | Wave | Status | Notes |
|---|-----------|------|--------|-------|
| 1 | Contracts realignment | 1 | completed | 63 tests |
| 2 | Filter engine package | 1 | completed | 147 tests |
| 3 | provider-fs realignment | 2 | completed | 29 tests |
| 4 | provider-localstorage + provider-http | 3 | completed | 53 tests |
| 5 | kanban-ui rewrite | 4 | completed | typecheck clean |
| 6 | Curated demo content | 5 | completed | 10 demo files |
| 7 | Documentation update | 5 | completed | README, ARCHITECTURE, copilot-instructions, VERIFICATION |

## Sub-Agent Reports

*(populated as waves complete)*

## Acceptance Criteria

| Criterion | Status | Verified | Notes |
|-----------|--------|----------|-------|
| All entity files validate against new Zod schemas | completed | yes | M6 demo content validated via Node script |
| Filter-engine Vitest coverage for every operator | completed | yes | 147 tests across 5 files |
| GET /boards/:slug/render returns correct cells | completed | yes | M3 integration tests |
| Drag-drop mutates exactly one file per drop | completed | yes | Single PATCH via mutation derivation |
| Read-only cell shows no-drop cursor, hides "+ Add" | completed | yes | M5 UI implementation |
| Homeless view lists unmatched items | completed | yes | M3/M4/M5 all implement |
| Slug-fallback renders column with title = slug | completed | yes | synthetic: true axis in all providers |
| README and copilot-instructions describe new model | completed | yes | M7 |
| pnpm typecheck && pnpm lint && pnpm test green | completed | yes | contracts 63, filter-engine 147, provider-fs 29, provider-http 53, provider-localstorage 33, sync-engine 132 |
| pnpm verify:ui green | completed | yes | agent-browser e2e: all 3 sync directions verified (web UI, local file edit, remote GitHub push) |
| isCellReadOnly bug (writeOnDrop + non-invertible) | fixed | yes | fix(domain) commit b41f4be — per-dimension writeOnDrop check in provider-fs and provider-localstorage |
