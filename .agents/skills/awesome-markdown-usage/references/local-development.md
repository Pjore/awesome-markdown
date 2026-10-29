# Local development

Use an isolated content root and explicit ports for each development stack. Project commands and prerequisites are in `CONTRIBUTING.md`.

## Filesystem provider

Defaults are host `127.0.0.1`, port `7701` and content root `./content`, resolved from the process working directory. Supply an absolute content path for repeatable runs:

```bash
PROVIDER_FS_CONTENT_ROOT=/absolute/path/to/test-content \
PROVIDER_FS_PORT=7713 pnpm --filter provider-fs dev
```

Keep durable content in its own repository/directory and use temporary content for verification. Check `/health`, `/boards` and the selected board's `/render` against the intended provider.

## Browser provider selection

The UI loads persisted browser settings first, then deployment defaults. Choose the active provider in Settings and confirm its URL. Browser-only demos use localStorage; filesystem work uses the HTTP provider.

Startup defaults can be configured explicitly:

```bash
VITE_DEFAULT_PROVIDER_KIND=http \
VITE_PROVIDER_FS_URL=http://127.0.0.1:7713 \
pnpm --filter kanban-ui dev
```

Vite exposes `VITE_*` values through client `import.meta.env`. `vite.config.ts` uses `loadEnv` for its server configuration. Restart the dev server after changing startup configuration.

Dev proxy targets are `PROVIDER_FS_PROXY_TARGET` (default `http://127.0.0.1:7701`) and `SYNC_ENGINE_PROXY_TARGET` (default `http://127.0.0.1:7402`). `KANBAN_UI_PORT` selects the UI port.

## Seeds and browser checks

With localStorage selected, `/?seed=m3` provisions two boards with shared `boards.$board.*` axes and independent board-scoped item values. Open the board list, then either demo. Repeating the explicit seed preserves existing item content/board entries while provisioning missing demo configuration.

Run actual browser coverage with a temporary filesystem service:

```bash
UI_URL=http://127.0.0.1:5183 PROVIDER_URL=http://127.0.0.1:7713 \
node apps/kanban-ui/agent-browser/m3/runner.mjs --live
```

The live runner exercises both providers, document placement, desktop/mobile scrolling, saves, conflicts and recovery downloads. `pnpm verify:ui` validates scenario descriptors.

## Content indexing

Provider-fs scans configured content at startup and updates its index through the file watcher. Inspect returned axis `synthetic` metadata to distinguish file-backed and generated catch-all definitions. A service restart performs a fresh scan when validating a changed file layout.
