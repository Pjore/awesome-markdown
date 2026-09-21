# awesome-markdown — Project Guide for AI Agents

## Purpose

Lightweight, git-backed kanban system. Flat pool of markdown items projected through query-based boards. Pluggable providers, isomorphic filter engine, independent sync-engine.

## Domain Model

All domain objects live as `.md` files in `content/` with `entityType: item | board | axis`. Boards project the item pool through filter rules — boards do not own items. Drop mutations are derived from the combined cell filter (board ∧ column ∧ swimlane); non-invertible filters (for example `or` and `any`) produce read-only cells. One drop equals one file write. Items in a board's `boards[]` that match no column appear in `/homeless`.

## Architecture

Monorepo with pnpm workspaces:

- `packages/contracts` — shared Zod v4 schemas and TypeScript types
- `packages/filter-engine` — isomorphic filter evaluation and mutation derivation
- `packages/provider-localstorage` — browser localStorage provider
- `packages/provider-http` — HTTP client provider
- `apps/kanban-ui` — React 19 + Vite 8 SPA
- `apps/provider-fs` — Fastify sidecar for markdown content
- `apps/sync-engine` — file watcher, git automation, and SSE server

## Key conventions

- Routes use `FastifyPluginAsyncZod`
- Import Zod from `zod`
- Use `.js` extensions for local ESM imports
- Reuse shared contracts from `@awesome-markdown/contracts`
- `content/` is resolved from the repo root

## Dev commands

```bash
pnpm install && pnpm typecheck && pnpm lint
./scripts/services start
./scripts/services status
pnpm test && pnpm verify:ui
```

## Environment

Copy `.env.example` files to `.env` as needed. Important variables:

- `SYNC_ENGINE_REPO_ROOT`
- `SYNC_ENGINE_TARGET_BRANCH`
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_PATH`
- `GITHUB_APP_WEBHOOK_SECRET`
- `PROVIDER_FS_PORT`
- `PROVIDER_FS_CONTENT_ROOT`
- `VITE_PROVIDER_FS_URL`

## Deployment

`docker-compose.dokploy.yml` (repo root) is the live Dokploy deployment source for the "board"
instance (provider-fs + sync-engine + kanban-ui), managed from `awesome-infra/board/deploy.sh`.
Dokploy's GitHub App fetches this file directly from `main` and auto-redeploys on every push
(`autoDeploy: true`) — **merging to `main` ships to production**, there is no separate promote
step. Traefik router labels in this file are pinned to Dokploy's existing domain records
(fixed `appName` + `uniqueConfigKey`s) and must stay in sync if those domains are ever
recreated; see the comment at the top of the file and `awesome-infra/board/deploy.sh` for the
full pattern.

## Sync-engine notes

- For feature work, set `SYNC_ENGINE_TARGET_BRANCH=<branch>` or check out the target branch before starting the engine.
- Local webhook verification should return `{"ok":false,"reason":"signature"}` instead of `404` when posting to `http://localhost:7402/webhooks/github`.
- If `content/` has unstaged changes, pull operations are deferred until the working tree is clean.

## File constraints

| Type | Limit |
|---|---|
| TypeScript source files | 400 lines max |
| AI files (instructions, prompts, skills) | 600 words max |

## Security

- Never commit private keys, tokens, or `.env` files.
- Mask credentials when displaying them.

## Workflow

- Use Conventional Commits: `type(scope): message`
- Work on a feature branch and open a pull request instead of committing to `main`
- Keep commits focused and logically grouped

## Agent Skills

Declared in `agents.toml`, installed via [dotagents](https://github.com/getsentry/dotagents). Before starting work, refresh managed skills: run `dotagents --project install` if installed globally, otherwise `npx @sentry/dotagents@latest --project install` — the npm package is `@sentry/dotagents`; an unrelated package literally named `dotagents` also exists on npm, don't use it. `credential-security`, `branch-and-pr`, `agent-browser`, and `commit-work` are sourced from `Pjore/awesome-os`; `frontend-design` from `anthropics/skills`; `grill-me` from `mattpocock/skills`.

## Browser tooling

Use browser automation for end-to-end UI verification when a task requires interacting with the running application. Load the `agent-browser` skill for CLI usage and the built-in-vs-CLI comparison (`references/browser-tool-comparison.md`, `references/testing-patterns.md`). See [CONTRIBUTING.md](CONTRIBUTING.md#seeding-demo-data-for-ui-verification) for this project's seeding flow and testid conventions.
