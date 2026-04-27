# sync-engine

Watches a `content/` directory for filesystem changes, auto-commits batched
changes to the local git repository, pushes to a GitHub remote, and broadcasts
`change` / `synced` / `offline` / `conflict` events over a Server-Sent Events (SSE) stream.

---

## Configuration

Configuration is loaded from (highest priority first):

1. Explicit overrides passed to `loadConfig()` (programmatic / test use)
2. Environment variables prefixed with `SYNC_ENGINE_`
3. JSON config file at `${repoRoot}/.awesome-markdown/sync.config.json`
4. Schema defaults

| Key                 | Env var                           | Default                | Description                                        |
|---------------------|-----------------------------------|------------------------|----------------------------------------------------|
| `repoRoot`          | `SYNC_ENGINE_REPO_ROOT`           | `process.cwd()`        | Absolute path to the git repository root           |
| `contentDir`        | `SYNC_ENGINE_CONTENT_DIR`         | `content`              | Path to watched dir, relative to `repoRoot`        |
| `commitAuthorName`  | `SYNC_ENGINE_COMMIT_AUTHOR_NAME`  | `awesome-markdown-sync`| Author name in auto-commits                        |
| `commitAuthorEmail` | `SYNC_ENGINE_COMMIT_AUTHOR_EMAIL` | `sync@local`           | Author email in auto-commits                       |
| `debounceMs`        | `SYNC_ENGINE_DEBOUNCE_MS`         | `750`                  | Quiet window before a batch is committed (ms)      |
| `port`              | `SYNC_ENGINE_PORT`                | `7402`                 | TCP port for the Fastify server                    |
| `host`              | `SYNC_ENGINE_HOST`                | `127.0.0.1`            | Bind address for the Fastify server                |
| `remote.enabled`    | `SYNC_ENGINE_REMOTE_ENABLED`      | `false`                | Enable remote pull/push (requires `GITHUB_TOKEN`)  |
| `remote.pullIntervalMs` | `SYNC_ENGINE_REMOTE_PULL_INTERVAL_MS` | `30000`        | How often to poll for remote changes (ms, min 2s)  |
| `remote.pushTimeoutMs`  | `SYNC_ENGINE_REMOTE_PUSH_TIMEOUT_MS`  | `15000`        | Push timeout hint in ms                            |

### Remote auth: GITHUB_TOKEN

Remote sync requires a **GitHub Fine-Grained Personal Access Token** (PAT) with:
- **Contents**: Read and write
- **Metadata**: Read

Set it as an environment variable:

```bash
export GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE
```

The token is **never** written to git config, included in commits, or emitted
in SSE events. The engine injects it into HTTPS remote URLs only at command
execution time.

> **SSH remotes are not supported** in M7. If your origin is SSH, convert it:
> ```bash
> git remote set-url origin https://github.com/<owner>/<repo>.git
> ```

### Example config file

```json
{
  "debounceMs": 500,
  "port": 7402,
  "commitAuthorName": "my-sync-bot",
  "commitAuthorEmail": "bot@example.com",
  "remote": {
    "enabled": true,
    "pullIntervalMs": 15000
  }
}
```

---

## Running

```bash
# Development (ts-node / tsx hot-reload)
SYNC_ENGINE_REPO_ROOT=/path/to/repo \
GITHUB_TOKEN=ghp_... \
SYNC_ENGINE_REMOTE_ENABLED=true \
pnpm --filter sync-engine dev

# Production (after build)
SYNC_ENGINE_REPO_ROOT=/path/to/repo \
GITHUB_TOKEN=ghp_... \
SYNC_ENGINE_REMOTE_ENABLED=true \
pnpm --filter sync-engine start
```

The repository at `repoRoot` must already be a git repo with at least one
commit and an HTTPS `origin` remote pointing to GitHub.

---

## HTTP Endpoints

| Method | Path      | Description                                      |
|--------|-----------|--------------------------------------------------|
| GET    | `/health` | Liveness probe — returns `{ ok: true }`           |
| GET    | `/status` | Engine status (running, lastCommit, remote info) |
| GET    | `/events` | SSE stream of sync events                        |

### SSE channel

```bash
curl -N http://127.0.0.1:7402/events
```

#### Event types

All event payloads conform to the `SyncEvent` union in
`packages/contracts/src/events.ts`.

| `event:` line | When emitted                                                                 |
|---------------|------------------------------------------------------------------------------|
| `change`      | After a local commit (watcher batch) or after a successful fast-forward pull |
| `synced`      | After every successful push to remote; also on recovery from `offline`       |
| `offline`     | After consecutive push/pull network failures (debounced — 2 by default)      |
| `conflict`    | When pull cannot fast-forward (diverged branches); pull/push suspended       |

#### `change` payload fields

- `path` — primary changed file path (relative to `repoRoot`)
- `paths` — all changed file paths in the batch or pull
- `commitSha` — SHA of the resulting local commit
- `source` — `"self"` | `"external"` | `"mixed"`

#### `conflict` payload fields

- `paths` — file paths modified on both local and remote sides (inside `contentDir`)
- `diffHunks` — per-file unified-diff strings (local side vs. merge base)

Resolve conflicts via the HTTP endpoint exposed by the sync-engine (M8):

```bash
POST /conflict/resolve   { "decision": "ours" | "theirs" }
```

The kanban-ui surfaces a `ConflictBanner` that calls this endpoint when the user picks a resolution strategy.

---

## Offline Tolerance

When a push or pull fails due to a network or auth error:

1. The engine retries with **exponential backoff** (default: 1 s → 2 s → 4 s → … → 60 s).
2. After **2 consecutive failures**, it emits an `offline` event with a `reason` string.
3. On the first success after an `offline` emission, it emits `synced` to signal recovery.

Pending local commits are never discarded — they accumulate and are pushed once
the remote is reachable again.

---

## Source Classification

Each commit carries a `source` label:

- `external` — none of the changed paths were recently marked as self-authored
- `self` — all paths were marked via `markSelfWrite()` within the TTL window
- `mixed` — some paths were self-authored, others were not

---

## Commit Message Convention

```
[sync-engine] <source>: <N> file(s)

Path: content/item-1.md
Path: content/item-2.md
Source: external
Batch-Id: 3f2504e0-4f89-11d3-9a0c-0305e82c3301
```

---

## Running Tests

```bash
pnpm --filter sync-engine test
```

Tests run against real temp git repositories and a local bare-repo remote under
`os.tmpdir()`. No browser or real GitHub network access is required.

### Local development against a bare remote

The test fixtures in `test/fixtures/bare-remote.ts` are the canonical recipe
for running the engine against a local bare repo:

```typescript
import { createBareRemote } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';

const remote = await createBareRemote();
const harness = await createRemoteEngineHarness(remote);
// ... assertions ...
await harness.stop();
await remote.cleanup();
```

---

## Current Limitations

- **SSH remotes** are not supported — HTTPS only.
- **No SSE event replay**: reconnecting clients do not receive missed events.
- **Windows**: chokidar may need `usePolling: true` on network drives.
  Set `CHOKIDAR_USEPOLLING=1` if needed.
