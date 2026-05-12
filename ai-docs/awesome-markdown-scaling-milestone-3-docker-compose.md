# Milestone 3: Docker Compose Deployment

## Metadata
- Parent plan: `awesome-markdown-scaling-main.md`
- Complexity / Work: 3 / 3
- Depends on: Milestone 1 and Milestone 2 may be developed in parallel; this milestone has no hard dependency on either
- Use cases: UC-4, UC-5

## Objective

Add a Docker Compose deployment path so non-developers (no Node/pnpm) can run the full stack with `docker compose up`. A `scripts/compose` shell wrapper gives developers the same subcommand UX as `scripts/services` without touching that file.

## Scope

**In:**
- `Dockerfile` for each of the three apps (`kanban-ui`, `provider-fs`, `sync-engine`) — multi-stage, production builds
- `docker-compose.yml` at repo root wiring all three services with shared mounts and env files
- `scripts/compose` shell wrapper: `start`, `stop`, `status`, `logs <service>`
- README.md "Docker Compose" section (additive only — Milestone 4 owns the full rewrite)

**Out:**
- Caddy / reverse-proxy / HTTPS setup (explicitly deferred per main plan)
- `.env` files — never committed; user copies from `.env.example` per the existing pattern
- Any changes to `scripts/services`, `ecosystem.config.cjs`, or PM2 flow
- Health-check endpoints — apps do not currently expose them; do not add
- CI image builds or Docker Hub publishing

## Constraints

- `PROVIDER_FS_HOST` defaults to `127.0.0.1` and `SYNC_ENGINE_HOST` defaults to `127.0.0.1` — both must be overridden to `0.0.0.0` in the Compose configuration or the services will not accept connections from outside their containers.
- `SYNC_ENGINE_REPO_ROOT` must be set to the path at which the repo root is bind-mounted **inside** the container (e.g. `/repo`). The same value used in `ecosystem.config.cjs` (`ROOT`) is the model, but for containers it must be the container-internal path.
- `PROVIDER_FS_CONTENT_ROOT` must resolve to the same bind-mounted `content/` path used by `sync-engine`.
- `VITE_*` variables are baked into the `kanban-ui` bundle at **build time** — `env_file:` has no effect on them at runtime. The Dockerfile must `COPY` `apps/kanban-ui/.env` before running `vite build`, which means the self-hoster must have that file in place before running `docker compose build`. Document this in the README section.
- `scripts/compose` must be executable (`chmod +x`) and use `#!/usr/bin/env sh` to match `scripts/services`.
- No `.env` file may be committed. `docker-compose.yml` must reference `env_file:` pointing at `apps/<name>/.env` — not inline `environment:` values.

## Contracts

- **Shared `content/` bind mount:** all three services mount the same host `./content` directory; `provider-fs` reads/writes it; `sync-engine` watches it. The host path is `./content` (relative to repo root); the container path is the agent's choice but must be consistent across both services and their respective env vars.
- **Repo root bind mount (`sync-engine` only):** the repo root (`.`) is bind-mounted into `sync-engine`'s container so `simple-git` can read `.git/`. The container path for this mount is what `SYNC_ENGINE_REPO_ROOT` must be set to.
- **`scripts/compose` → Compose service name mapping:** the wrapper accepts `ui`, `fs`, `sync` as service aliases and maps them to the Compose service names `kanban-ui`, `provider-fs`, `sync-engine` before delegating to `docker compose`.

## Definition of Done

- [ ] `docker compose up -d` from a clean checkout (with `.env` files present) starts all three containers without errors
- [ ] UI is reachable at `http://localhost:5173`; API at `http://localhost:7701`; SSE stream at `http://localhost:7402`
- [ ] `content/` directory is writable by `provider-fs` and observable by `sync-engine` via the shared mount
- [ ] `./scripts/compose start` / `stop` / `status` / `logs fs` all produce the expected output and exit codes
- [ ] `./scripts/compose logs ui` streams `kanban-ui` container output and `./scripts/compose logs sync` streams `sync-engine` output
- [ ] Running `./scripts/compose` when Docker is not installed exits with a clear error message (non-zero exit code)
- [ ] README.md contains a new "Docker Compose" section documenting: prerequisites (Docker + Docker Compose plugin), the `.env` copy step, `docker compose build`, `docker compose up -d`, and a brief comparison with the PM2 path
- [ ] No `.env` file is tracked by git after this milestone; `docker-compose.yml` references only `env_file:` paths
- [ ] `pnpm typecheck && pnpm lint` pass; existing test suites are green

## Risks & Decisions To Get Right

- **Static file server for `kanban-ui`:** `vite preview` is the path of least resistance (no new base image) but is not intended for production. Using an `nginx` final stage (multi-stage build, copy `dist/` into `nginx:alpine`) is production-appropriate and drops Node from the runtime image. **Choose nginx** — it avoids the "not for production" footgun and is the expected choice for a self-hoster deployment.
- **`VITE_*` build-time baking:** if the self-hoster hasn't created `apps/kanban-ui/.env` before `docker compose build`, the VITE_* vars will be absent and the app will fall back to `localhost` defaults (which work for single-machine deploys). This is acceptable but must be documented so users targeting a remote host know to set vars before building.
- **`depends_on` ordering:** `sync-engine` depends on `provider-fs` being up; `kanban-ui` can start independently. Use `depends_on` with `service_started` condition (not `service_healthy`, since no health checks exist). Do not add health checks to satisfy `service_healthy` — that is out of scope.
- **Bind mount permissions:** the `content/` directory may not exist on a fresh clone; Docker will create it as root. Document that users should `mkdir -p content` before first run, or add it to the README setup steps.
- **Node version pinning:** each Dockerfile must pin a specific Node LTS major version (e.g. `node:20-alpine`) rather than `node:latest` to keep builds reproducible.

## Open Questions

- None. Caddy / reverse-proxy / HTTPS is explicitly excluded. `docker-compose.yml` contains only the three app services — no stubs, no comments referencing Caddy.
