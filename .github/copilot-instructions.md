# awesome-markdown — Project Guide for AI Agents

## Purpose

Lightweight, git-backed kanban system. Pluggable persistence providers
(localStorage in-browser, local-fs markdown sidecar), independent sync-engine
for git + external-change notifications, and a React drag-and-drop kanban UI.

## Architecture

Monorepo with pnpm workspaces:

- `packages/contracts` — Zod v4 schemas + inferred TypeScript types (shared)
- `packages/provider-localstorage` — In-browser localStorage provider
- `apps/kanban-ui` — React 19 + Vite 8 + Tailwind v4 SPA with @dnd-kit
- `apps/provider-fs` — Fastify v5 sidecar (markdown files + YAML frontmatter)
- `apps/sync-engine` — File watcher, git auto-commit, SSE event emitter

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | React 19, Vite 8, Tailwind v4, @dnd-kit |
| API/sidecar | Fastify v5 + `fastify-type-provider-zod` |
| Validation | Zod v4 — `import { z } from "zod"` |
| Git | simple-git + GitHub Fine-Grained PAT (`GITHUB_TOKEN` env var) |
| File watching | chokidar |
| Markdown | gray-matter |
| Live channel | Native SSE (no WebSocket) |
| Monorepo | pnpm workspaces |

## Key Conventions

- **Routes**: Always `FastifyPluginAsyncZod` — Zod schemas auto-type request properties
- **Validation**: Zod v4 throughout; import from `"zod"` only
- **Imports**: `.js` extension in all local API/sync-engine imports (ESM)
- **Shared types**: Import from `@awesome-markdown/contracts`
- **Content dir**: `./content` relative to repo root
- **Git auth**: `GITHUB_TOKEN` fine-grained PAT with `Contents: read/write`
- **No `any`** in `packages/contracts`; all cross-package calls typed via exports

## Ports (defaults)

| Service | Port |
|---------|------|
| kanban-ui dev server | 5173 |
| provider-fs sidecar | 7701 |
| sync-engine | 7402 |

## Dev Commands

```bash
# Install (requires Node.js 22+)
pnpm install

# Quality gates (run before every commit)
pnpm typecheck && pnpm lint

# Start each service
pnpm --filter kanban-ui dev
pnpm --filter provider-fs dev
SYNC_ENGINE_REPO_ROOT=$(pwd) pnpm --filter sync-engine dev

# Tests
pnpm test                          # all Vitest suites
pnpm verify:ui                     # aggregate agent-browser UI smoke suite
pnpm --filter kanban-ui verify:m3  # per-milestone agent-browser
```

## File Constraints

| Type | Limit |
|------|-------|
| TypeScript source files | 400 lines max |
| AI files (instructions, prompts, skills) | 600 words max |

## Security

- **Never commit `GITHUB_TOKEN`** — load from `.env` (gitignored)
- Use `.env.example` as template; document required vars there
- Mask credentials when confirming: `${VAR:0:8}...`

## Workflow

- **Conventional Commits** — `type(scope): message`
- **Branch + PR** — never commit to `main` directly
- Load `branch-and-pr` skill before starting any feature work
- Load `commit-work` skill before making commits
