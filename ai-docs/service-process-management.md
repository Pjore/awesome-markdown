# Implementation Plan: service-process-management

## 0. Metadata
- **Complexity:** 2
- **Uncertainty:** 2
- **Work:** 2
- **Scope:** Add a PM2-based supervisor, a `services` CLI wrapper, worktree-switch support, and a minimal set of VS Code tasks for managing the three long-running dev services (`kanban-ui`, `provider-fs`, `sync-engine`).
- **Non-goals:**
  - No changes to service source code, hot-reload behaviour, or ports.
  - No production deployment story (dev/local/Codespaces/Coder/devcontainer only).
  - No docker-compose integration in this iteration (kept compatible for future addition).
  - No multi-instance / per-worktree port-offset support.

## 1. Problem Statement
The three services (`kanban-ui` on 5173, `provider-fs` on 7701, `sync-engine` on 7402) are currently launched ad-hoc with `pnpm --filter <name> dev` in separate terminals. There is no consistent way for the operator or AI agents to start, stop, inspect status, or read logs across environments (macOS local, devcontainer, Codespaces, Coder). With multiple parallel agent worktrees, ownership of the running instances is undefined and prone to port collisions.

## 2. Constraints & Assumptions
- Node.js 22+ and pnpm are available in every supported environment (already required by repo).
- PM2 is added as a dev dependency at the workspace root and invoked via `pnpm exec pm2`; no global install required.
- PM2's daemon is per-user and stores state under `~/.pm2`, which is intentionally shared across worktrees to enforce single-instance ownership.
- Static ports remain `5173`, `7701`, `7402`. No port-offset support.
- `GITHUB_TOKEN` and any other env vars continue to be loaded from `.env` files; PM2 is configured to forward them.
- Hot reload / watch mode for each service is provided by its existing `dev` script and must not be replaced.
- VS Code tasks are wrappers; they do not duplicate behaviour, only delegate to the `services` CLI.
- Operator and agents both use the same `services` CLI surface; no agent-specific tooling.

## 3. Target State (Definition of Done)
**Functional:**
- A single `services` shell wrapper at `scripts/services` exposes `start`, `stop`, `restart`, `status`, `logs`, `switch`, and `help` subcommands.
- A PM2 ecosystem config at the repo root defines exactly three apps: `ui`, `fs`, `sync`, each running its existing `pnpm --filter <pkg> dev` command in watch/hot-reload mode.
- The PM2 daemon survives terminal/agent-session exits; services keep running until explicitly stopped.
- `services status` returns a concise table showing each service's name, PID, uptime, restart count, port, and current owning worktree path.
- `services logs <name>` streams that service's stdout/stderr from PM2; `services logs <name> --lines N --nostream` returns the last N lines and exits (agent-friendly).
- `services switch <worktree-path>` stops the running services and restarts them with `cwd` pointed at the given worktree, on the same static ports.
- VS Code tasks exist for: Start All, Stop All, Status, Tail UI Log, Tail FS Log, Tail Sync Log.
- Documentation in `README.md` (or a new `docs/SERVICES.md` referenced from the README) describes the workflow for operator and agents and the worktree-ownership rule.

**Non-functional:**
- Identical command surface across macOS local, devcontainer, Codespaces, and Coder workspaces.
- Cold start of all three services completes in under 10 seconds on a typical dev machine.
- Zero new system-level dependencies; everything ships via pnpm.
- No secrets are written to logs, ecosystem config, or VS Code tasks.

**Success Criteria:**
- [ ] `pnpm install` followed by `./scripts/services start` brings all three services online with hot reload working.
- [ ] Closing the originating terminal does not stop the services.
- [ ] `./scripts/services status` shows three running entries with correct ports.
- [ ] `./scripts/services logs ui --lines 50 --nostream` prints recent UI dev-server output and exits.
- [ ] In a second worktree, `./scripts/services switch /path/to/worktree2` stops the previous instances and starts them from the new path on the same ports.
- [ ] All VS Code tasks (Start All / Stop All / Status / Tail \<each\>) succeed and produce expected output.
- [ ] `pnpm typecheck && pnpm lint` still pass; no source files outside tooling changed.
- [ ] The same commands work unchanged inside a Codespace or Coder workspace.

## 4. Change Overview
| Area | Type | Description |
|------|------|-------------|
| Root `package.json` | Modify | Add `pm2` to `devDependencies`; add convenience script aliases (`services:start`, `services:stop`, `services:status`, `services:logs`) that delegate to `scripts/services`. |
| `ecosystem.config.cjs` (root) | New | Declare three PM2 apps (`ui`, `fs`, `sync`) with watch/hot-reload-aware `dev` commands, env passthrough, and a CWD resolved from a `SERVICES_CWD` env var (defaults to repo root). |
| `scripts/services` | New | Shell wrapper exposing `start`, `stop`, `restart`, `status`, `logs`, `switch`, `help`; resolves repo root, loads `.env`, invokes `pnpm exec pm2` with the ecosystem config, and pretty-prints status. |
| `scripts/services-status.mjs` | New | Small Node helper invoked by `services status` that calls `pm2 jlist`, joins it with the static port map and the recorded owning-worktree path, and prints a table. |
| `.run/owner` (gitignored runtime file) | New (runtime-only) | Records the absolute path of the worktree that currently owns the running services; written by `start`/`switch`, cleared by `stop`. |
| `.gitignore` | Modify | Ignore `.run/`. |
| `.vscode/tasks.json` | New or Modify | Add minimal task set: Services: Start All, Services: Stop All, Services: Status, Services: Tail UI Log, Services: Tail FS Log, Services: Tail Sync Log. Each delegates to `scripts/services`. |
| `.vscode/extensions.json` | Modify (optional) | No new recommendations required. |
| `.devcontainer/devcontainer.json` | Modify (if present) | Ensure `postCreateCommand` runs `pnpm install` so PM2 is available; no feature install needed. |
| `README.md` | Modify | Replace the per-service `pnpm --filter ... dev` instructions with a "Running services" section pointing at `./scripts/services` and the VS Code tasks; document the worktree-ownership rule and `switch` workflow. |
| `docs/SERVICES.md` | New (optional) | Long-form reference: command table, troubleshooting, log locations, agent usage examples. |
| `.github/copilot-instructions.md` | Modify | Update the "Dev Commands" table to reference `./scripts/services` as the canonical way to run services; keep `pnpm --filter ... dev` only as the underlying mechanism. |

## 5. Use Cases

### UC-1: Operator starts all services
**Actor:** Operator on macOS/Codespaces/Coder/devcontainer.
**Trigger:** Runs `./scripts/services start` or VS Code task "Services: Start All".
**Flow:**
1. Wrapper resolves repo root and loads `.env`.
2. Wrapper records the current worktree path as the owner.
3. Wrapper invokes PM2 with the ecosystem config; PM2 launches `ui`, `fs`, `sync`.
4. Wrapper waits briefly, then prints `services status`.

**Input:** None.
**Output:** Status table showing three running services on the documented ports.
**Errors:** Port already in use → wrapper reports the conflict and exits non-zero. Already running in another worktree → wrapper reports the existing owner and instructs the user to use `services switch` or `services stop` first.

### UC-2: Operator or agent inspects status
**Actor:** Operator or AI agent.
**Trigger:** Runs `./scripts/services status`.
**Flow:**
1. Wrapper invokes the Node status helper.
2. Helper queries PM2's JSON list, merges with the static port map and the owner file.
3. Helper prints a fixed-column table.

**Input:** None.
**Output:** Table with columns: name, status, pid, uptime, restarts, port, owning-worktree.
**Errors:** PM2 daemon not running → output shows all services as "stopped" and exits zero.

### UC-3: Agent reads bounded log output
**Actor:** AI agent.
**Trigger:** Runs `./scripts/services logs <name> --lines N --nostream`.
**Flow:**
1. Wrapper validates `<name>` is one of `ui|fs|sync`.
2. Wrapper invokes `pm2 logs <name> --lines N --nostream`.
3. PM2 prints the last N lines of stdout+stderr and exits.

**Input:** Service name; optional `--lines` and `--nostream` flags.
**Output:** Recent log lines on stdout.
**Errors:** Unknown service name → wrapper prints valid names and exits non-zero.

### UC-4: Operator tails a live log in VS Code
**Actor:** Operator.
**Trigger:** Runs VS Code task "Services: Tail UI Log" (or FS / Sync).
**Flow:**
1. Task opens a dedicated terminal panel.
2. Terminal runs `./scripts/services logs ui` (streaming).
3. Output streams until the operator closes the panel.

**Input:** None (task choice selects the service).
**Output:** Live log stream.
**Errors:** Service not running → PM2 reports it; operator can run "Services: Start All".

### UC-5: Switching ownership to another worktree
**Actor:** Operator (typically) or agent (when explicitly authorised).
**Trigger:** Runs `./scripts/services switch <absolute-worktree-path>`.
**Flow:**
1. Wrapper validates the target path contains the same monorepo (sentinel: `pnpm-workspace.yaml`).
2. Wrapper stops all PM2 apps.
3. Wrapper rewrites the owner file to the new path.
4. Wrapper restarts PM2 with `SERVICES_CWD=<new-path>` so each app's `cwd` points at the target worktree.
5. Wrapper prints status.

**Input:** Absolute path to another worktree of this repository.
**Output:** Status table reflecting services running from the new worktree.
**Errors:** Path missing / not a worktree of this repo → exits non-zero with explanation. Switch failed mid-way → wrapper leaves PM2 stopped and prints recovery hint.

### UC-6: Operator stops services explicitly
**Actor:** Operator.
**Trigger:** Runs `./scripts/services stop` or VS Code task "Services: Stop All".
**Flow:**
1. Wrapper invokes `pm2 stop` for the three apps (or `pm2 delete` to fully clear).
2. Wrapper clears the owner file.
3. Wrapper prints final status (all stopped).

**Input:** None.
**Output:** Confirmation of stopped services.
**Errors:** Daemon already down → exits zero with note.

### UC-7: Agent verifies services are healthy before running browser tests
**Actor:** AI agent.
**Trigger:** Pre-test hook in agent workflow.
**Flow:**
1. Agent runs `./scripts/services status`.
2. If any service is not "online", agent runs `./scripts/services start`.
3. Agent re-checks status, then proceeds.

**Input:** None.
**Output:** Healthy status table.
**Errors:** Repeated start failure → agent surfaces the error and stops.

### Contracts

**Contract: ecosystem-config**
- **Provider:** `ecosystem.config.cjs`
- **Consumer:** `scripts/services` and PM2.
- **Shape:** Three app entries each with `name` (`ui|fs|sync`), `script` (pnpm), `args` (`--filter <pkg> dev`), `cwd` (resolved from `SERVICES_CWD` or repo root), `env` (port + service-specific vars including `SYNC_ENGINE_REPO_ROOT`), `autorestart: true`, `watch: false` (services run their own watcher), `kill_timeout`, and stable `pm_id`-independent naming.

**Contract: services-cli**
- **Provider:** `scripts/services`
- **Consumer:** Operator, AI agents, VS Code tasks.
- **Shape:** Subcommands `start`, `stop`, `restart [name]`, `status`, `logs <name> [--lines N] [--nostream]`, `switch <path>`, `help`. Exit code `0` on success, non-zero on validation/runtime errors. Output of `status` is a stable column table; output of `logs` is raw PM2 stream/text.

**Contract: owner-file**
- **Provider:** `scripts/services`
- **Consumer:** `scripts/services-status.mjs` and any agent inspecting current ownership.
- **Shape:** Plain text file at `.run/owner` containing a single absolute path; absent or empty when no owner.

## 6. Execution Steps

1. **Add PM2 dependency.** Add `pm2` to root `devDependencies` and run `pnpm install`. Verify `pnpm exec pm2 --version` works.
2. **Author `ecosystem.config.cjs`.** Define `ui`, `fs`, `sync` apps with the existing `pnpm --filter <pkg> dev` commands, `cwd` resolved from `SERVICES_CWD || process.cwd()`, env vars (including `SYNC_ENGINE_REPO_ROOT` resolved from the same root), `autorestart: true`, `watch: false`, sensible `kill_timeout`. Document each app's port via an env var only.
3. **Create `scripts/services`.** POSIX shell, `set -euo pipefail`, resolves repo root via `git rev-parse --show-toplevel`, sources `.env` if present, then dispatches subcommands to `pnpm exec pm2 ...` with the ecosystem config. Implement `start`, `stop`, `restart`, `logs`, `help`. Make executable.
4. **Create `scripts/services-status.mjs`.** Reads `pm2 jlist` via `child_process`, merges with the static port map (`{ui:5173, fs:7701, sync:7402}`) and `.run/owner`, prints a fixed-column table. Wire `services status` to invoke it.
5. **Implement `services switch`.** Validate target is a sibling worktree of this repo (presence of `pnpm-workspace.yaml`), stop apps, write `.run/owner`, restart with `SERVICES_CWD=<target>`, re-run status.
6. **Wire `.run/` into `.gitignore`.**
7. **Add root `package.json` aliases.** `services:start`, `services:stop`, `services:status`, `services:logs` each delegating to `./scripts/services`.
8. **Author `.vscode/tasks.json` entries.** Six tasks total (Start All, Stop All, Status, Tail UI Log, Tail FS Log, Tail Sync Log), each with `type: shell`, `command: ./scripts/services`, appropriate `args`, presentation set so tail tasks open dedicated terminals.
9. **Update `.devcontainer/devcontainer.json`** (if present) so `postCreateCommand` includes `pnpm install`, ensuring PM2 is on PATH inside the container. No system packages required.
10. **Document in `README.md`.** Add a "Running services" section with the canonical commands and the worktree-ownership rule. Replace any existing per-service start instructions with a pointer to `./scripts/services`.
11. **Optional: add `docs/SERVICES.md`** for long-form reference (commands, examples, troubleshooting, agent usage patterns).
12. **Update `.github/copilot-instructions.md`** Dev Commands section so future agents default to `./scripts/services`.
13. **Smoke test on the host environment**: run start, status, logs (streaming and `--nostream`), trigger a hot-reload edit in each service, run switch into a temporary second worktree, then stop. Confirm all success criteria.
14. **Run quality gates.** `pnpm typecheck && pnpm lint`.

## 7. Validation & Verification
- Manual run of every command in UC-1 through UC-7 on the primary environment, captured in a short verification log appended to `docs/VERIFICATION.md` if that file is the project's verification record.
- Confirm hot reload still works by editing one file per service and observing the expected effect (UI HMR, FS Fastify reload, sync-engine restart).
- Confirm PM2 daemon survives terminal close (close the terminal that ran `start`, open a new one, run `status` — services still online).
- Confirm a fresh Codespace/Coder workspace can run `pnpm install && ./scripts/services start` without additional setup.
- Confirm `services switch` correctly moves the working directory: after switching, edit a file only present in the new worktree and observe the running service pick it up.
- `pnpm typecheck` and `pnpm lint` pass.

## 8. Rollback Strategy
- Revert is fully local: delete `ecosystem.config.cjs`, `scripts/services`, `scripts/services-status.mjs`, `.vscode/tasks.json` additions, and the `pm2` devDependency entry; restore the prior README section. No source-code or schema changes to undo.
- The `.run/` directory contains only runtime state and can be removed at any time.
- A single `pnpm exec pm2 kill` cleanly stops the daemon if PM2 itself misbehaves; nothing persists outside `~/.pm2` and `.run/`.

## 9. Open Questions
- Should `services start` automatically detect a stale owner pointing at a deleted worktree and self-heal, or always require explicit `switch` / `stop`?
- Should we add a `services doctor` subcommand later that verifies port availability, PM2 daemon health, and `.env` presence? (Out of scope here; track as a follow-up.)
- For a future docker-compose-managed DB, do we (a) wrap `docker compose up` as a fourth PM2 process, or (b) keep compose independent and have `services start` invoke both? Decide when the DB is introduced.

## 10. References
- PM2 docs: https://pm2.keymetrics.io/docs/usage/quick-start/
- PM2 ecosystem file: https://pm2.keymetrics.io/docs/usage/application-declaration/
- PM2 process management JSON list (`pm2 jlist`): https://pm2.keymetrics.io/docs/usage/pm2-api/
- VS Code tasks reference: https://code.visualstudio.com/docs/editor/tasks
- Git worktree: https://git-scm.com/docs/git-worktree
