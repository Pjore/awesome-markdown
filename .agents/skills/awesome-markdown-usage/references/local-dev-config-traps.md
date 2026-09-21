# Local dev: silent-failure config traps

These don't throw or log anything — the symptom is just "the board is empty" or
"the wrong data is showing" with a perfectly healthy-looking process. Check these
before assuming something is actually broken.

## `kanban-ui` defaults to `localStorage`, not `provider-fs`

`apps/kanban-ui/src/settings/provider-settings.ts`'s `DEFAULT_SETTINGS` is
`{ kind: 'localStorage' }` unless **both** `VITE_DEFAULT_PROVIDER_KIND=http` and
`VITE_PROVIDER_FS_URL=<url>` are set at Vite startup. With no override, the app boots
against the browser's (empty) `localStorage` — no error, no console warning, boards
just render empty. This is the single most common reason a freshly-started `kanban-ui`
"shows no boards" even though `provider-fs` itself is healthy and has real content.

Symptom checklist when boards are empty in the UI but `curl http://<provider-fs>/boards`
returns data:
1. Confirm `apps/kanban-ui/.env` sets `VITE_DEFAULT_PROVIDER_KIND=http` and
   `VITE_PROVIDER_FS_URL`.
2. Restart the Vite dev server (`pm2 restart ui` or equivalent) — these are read at
   startup, not hot-reloaded from a running session.
3. Even with both set, a **previously-saved browser setting wins**: the app persists
   the active provider to `localStorage['awesome-markdown:provider-settings']` on every
   save, and loads from there first, falling back to `DEFAULT_SETTINGS` only when that
   key is absent or invalid (`apps/kanban-ui/src/settings/storage.ts`). If a browser
   already visited this UI before the env vars existed, it has a stale
   `{"kind":"localStorage"}` entry that silently overrides the new defaults. Clear that
   `localStorage` key, or open the in-app Settings panel and switch providers manually.

## Vite only auto-loads `VITE_*` vars into `import.meta.env` — never `process.env`

Vite's built-in `.env` loading is scoped to variables prefixed `VITE_`, and only injects
them into `import.meta.env` for **client** code. It does **not** touch `process.env` for
`vite.config.ts` itself. A `vite.config.ts` that reads `process.env['SOME_VAR']` directly
will only ever see an actual shell/pm2-exported environment variable — anything set in
`.env` alone is silently ignored, with no error (the code just falls through to its
`??` default).

If `vite.config.ts` needs a **server-only** knob (e.g. a proxy target) sourced from the
same `.env` file as the `VITE_*` client vars, it must opt in explicitly:

```ts
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }; // '' prefix = load everything
  const providerFsTarget = env['PROVIDER_FS_PROXY_TARGET'] ?? 'http://127.0.0.1:7701';
  // ...
});
```

`apps/kanban-ui/vite.config.ts` does this for `PROVIDER_FS_PROXY_TARGET` and
`SYNC_ENGINE_PROXY_TARGET` (PR Pjore/awesome-markdown#34). Before that fix, setting
either var in `.env` had zero effect and the proxy silently targeted its hardcoded
fallback port — which, combined with the next gotcha, made it proxy to the *wrong*
`provider-fs` port without any error.

## `provider-fs`'s own defaults don't match what other tools assume

`provider-fs` defaults to port `7701` and resolves `PROVIDER_FS_CONTENT_ROOT` (default
`./content`) **relative to its own process cwd** — which, when started via
`pnpm --filter provider-fs dev`, is `apps/provider-fs/`, not the repo root. Two distinct
silent failures follow:

- Set `PROVIDER_FS_CONTENT_ROOT=./content` in `apps/provider-fs/.env` expecting the repo
  root's `content/` and you instead get `apps/provider-fs/content` — usually empty or
  stale, with the server starting up fine and answering `200 OK` on every endpoint, just
  with no (or wrong) data. Always use an **absolute path**.
- Other tooling in this ecosystem (the `steward` daemon, the `tickets` skill,
  `TICKETS_BASE_URL`) hardcodes `http://127.0.0.1:7801` as its local-sidecar default —
  not `7701`. Unless `PROVIDER_FS_PORT=7801` is set explicitly, those tools' requests
  will 404/connection-refuse against a `provider-fs` quietly listening on the "correct"
  (to itself) but mismatched default port.

## `provider-fs`'s file watcher can miss a rename while running

`apps/provider-fs/src/fs/watcher.ts` watches `contentRoot/**/*.md` via chokidar and
merges changes into the live in-memory index. In practice, renaming a file in place
(e.g. `mv wrong-name.md right-name.md`) while `provider-fs` is already running has been
observed to not register the new file — the API keeps serving a `synthetic: true`
fallback for an axis/board slug that has a real file on disk. `GET /boards/:slug/render`
returning `"synthetic": true` for an axis you just created or renamed on disk, while the
file demonstrably exists and parses, means: restart the `provider-fs` process to force a
full re-scan (`pm2 restart fs`) rather than debugging the filter/schema further.

## Board content stored inside a git checkout is fragile

Demo/seed content under a repo's own `content/` directory is subject to being silently
reset by ordinary git operations — `git worktree remove`, `git clean`, branch switches,
even another concurrent agent session editing the same checkout — with no warning that
anything was deleted. Prefer keeping durable board content in its own directory/repo
outside any project checkout (this Home keeps it at
`~/.agent-workspace/board-content`, pointed to by `PROVIDER_FS_CONTENT_ROOT`) so it
survives repo resets, re-clones, and worktree churn.
