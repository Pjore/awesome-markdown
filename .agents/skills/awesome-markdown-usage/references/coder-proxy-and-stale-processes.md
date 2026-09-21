# Local dev: Coder proxy and stale-process traps

## Vite rejects the Coder proxy's `Host` header by default

Coder fronts a dev server with a per-workspace subdomain,
`<port>--<branch>--<workspace>--<owner>.coder.<domain>`. Vite validates the incoming
`Host` header against `server.allowedHosts` and rejects anything unrecognized with a
403 and the message `Blocked request. This host ("...") is not allowed.` — this looks
like a network/proxy problem but is purely a Vite config gap. Fix: add the wildcard
suffix to `server.allowedHosts` in `vite.config.ts` (e.g. `['.coder.<domain>']`) so any
subdomain on that base domain is accepted. Do this once per app that's exposed through
the proxy, not per-workspace-name.

## Prefer one origin over several Coder-proxied subdomains

Each port gets its **own** subdomain through the Coder proxy, and each is a distinct
origin as far as the browser is concerned. Pointing the UI's provider config at a
second port's Coder subdomain directly (e.g. `https://7801--...` for `provider-fs`
while the UI itself is served from `https://5173--...`) works, but adds:

- an extra Coder-auth-redirect hop for that second origin the first time it's hit, and
- a second origin's worth of cookie/CORS edge cases to reason about.

Prefer routing everything through the **UI's own dev server**, using its built-in
reverse proxy (`server.proxy` in `vite.config.ts`) to forward `/provider-fs/*` and
`/sync-engine/*` to the real local ports server-side. The browser then only ever talks
to one origin (the UI's Coder subdomain), and the proxy target only needs to be
reachable from inside the workspace, not from the browser.

## Orphaned dev processes silently squat ports and outlive their worktree

`vite`/`tsx` dev processes started from a worktree keep running (and keep their port
bound) even after `git worktree remove` deletes that worktree's directory — the process
just keeps serving from its now-deleted working directory until explicitly killed.
Two ways this bites:

1. **A new process can't bind the port it should**, silently falling back to the next
   free one (Vite logs `Port 5173 is in use, trying another one...` — easy to miss in
   a pm2 log tail). The service you *think* is running on the expected port is actually
   the stale orphan; the real one moved to `port + 1`.
2. **The orphan answers requests with stale/deleted-worktree data.** `pm2 status`
   showing your managed process as `online` on the expected port doesn't rule this out
   — a completely different, unmanaged process can be bound to a *different* port that
   something else (e.g. a proxy target) still points at.

Diagnosis: don't trust `pm2 status`/`pm2 logs` alone. Cross-check with
`ss -tlnp | grep <port>` to get the actual PID bound to a port, then
`ps -p <pid> -o cmd` and `readlink -f /proc/<pid>/cwd` to see what it actually is and
where it's running from. Kill anything whose cwd points at a worktree that no longer
exists.

## `pm2 logs --nostream` can show stale error text after a process is healthy

The log tail is a file tail, not a live health check — it can show a crash from several
restarts ago even once the process has been stably `online` for minutes. Before trusting
an error in a log tail, check the process's current `uptime`/restart count in
`pm2 list`, and re-verify with a fresh request (`curl .../health`) rather than treating
old log lines as the current state. `pm2 flush` clears the slate if you want a clean tail
going forward.
