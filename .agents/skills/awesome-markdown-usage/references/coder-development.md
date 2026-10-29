# Coder development

## One browser origin

Coder forwards a service through a workspace subdomain such as:

```text
https://<port>--<branch>--<workspace>--<owner>.coder.example.com
```

Use the workspace's actual forwarded URL. Vite's `server.allowedHosts` declares the trusted Coder hostname suffix; this checkout configures `.coder.pjore.com`.

The UI's dev server proxies:

- `/provider-fs/*` to `PROVIDER_FS_PROXY_TARGET`.
- `/sync-engine/*` to `SYNC_ENGINE_PROXY_TARGET`.

Configure the browser's HTTP-provider base URL as `<UI origin>/provider-fs` for one-origin development. The browser then uses the UI's Coder authentication/origin while the server forwards to local service targets.

## Verify the process behind a port

1. Inspect bound ports with `ss -ltnp`.
2. Match the service PID and `/proc/<pid>/cwd` to the intended worktree.
3. Check fresh health, board definitions and rendering through the selected endpoint.
4. Exercise a visible browser operation and confirm authoritative data through the same provider.

Use explicit, distinct ports for parallel development instances. Record the URL/port reported by the running server, and keep the worktree present for the lifetime of its dev processes.

Before restarting a managed process, inspect its configured script path. Stop only processes belonging to the intended stack, then verify the listener and current endpoint responses.

## Read current health

Combine current process status/uptime with a fresh service request. Use bounded, non-streaming logs for targeted diagnostics. `agent-browser` snapshots and screenshots verify the actual UI; real pointer movement exercises pointer-based drag/drop libraries.

For shared Home operations, use `home board connection` to verify the configured remote and its release/content statuses. Keep integration credentials in their protected Home configuration and pass private mutation payloads through the declared client's JSON stdin.
