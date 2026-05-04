---
name: dev-environment-coder
description: "Coder workspace environment setup, port sharing, and troubleshooting. Load this skill when running inside a Coder workspace and you need to expose services publicly (e.g. GitHub webhooks), configure browser automation on ARM64, or debug Coder-specific connectivity issues."
version: "1.0.0"
category: environment
---

# Dev Environment — Coder Workspace

This skill covers Coder-specific setup and troubleshooting. It does **not** apply when running on a plain localhost or devcontainer environment (unless you have explicitly port-forwarded via Coder).

---

## Webhook exposure

Services running inside a Coder workspace are accessible via the Coder subdomain proxy:

```
https://{port}--{agent}--{workspace}--{owner}.coder.{domain}/{path}
```

**Example:** `https://7402--main--awesome-markdown--pjore.coder.pjore.com/webhooks/github`

Rules:
- Always **double-dash** (`--`) between segments — a single dash produces a different, non-resolving hostname.
- The proxy is always HTTPS regardless of how the local service binds.
- Verify the URL resolves before configuring: `curl https://<url>/health`

### Port sharing must be Public for GitHub webhooks

GitHub webhooks cannot pass the Coder proxy auth challenge. If a port's sharing level is **Authenticated**, all webhook deliveries return 401 before reaching the service.

**Fix:** Open the Coder workspace UI → **Shared Ports** → set the relevant port to **Public**.

Verify the webhook endpoint is reachable without auth:
```bash
curl -si https://{port}--...coder.{domain}/webhooks/github -X POST -H "Content-Type: application/json" -d '{}' | head -3
# Expect HTTP/2 4xx from the *service* (e.g. {"ok":false,"reason":"missing-body"})
# NOT HTTP/2 401 from the Coder proxy
```

---

## Ports reference (this project)

| Service | Local port | Coder path segment |
|---------|------------|-------------------|
| kanban-ui (Vite) | 5173 | `5173` |
| provider-fs | 7701 | `7701` |
| sync-engine / webhook | 7402 | `7402` |

---

## ARM64 — browser automation

Coder workspaces typically run on `aarch64`. `agent-browser install --with-deps` has no ARM64 build; use Playwright's bundled Chromium instead.

See [references/arm64-setup.md](../agent-browser/references/arm64-setup.md) for the one-time setup.

Key points:
- The container filesystem resets on rebuild but `$HOME` (`/home/coder`) persists.
- Re-run `apt` system deps after each rebuild; the Playwright binary and `~/.agent-browser/config.json` survive.

---

## Running `gh` CLI from within a Coder workspace

The `gh` CLI needs a git repo in `$PWD`. If the terminal CWD drifted (e.g. to `/home/coder`), use an explicit subshell:

```bash
bash -c "cd /home/coder/awesome-markdown && gh pr edit 5 --body-file /tmp/body.md"
```

Avoid `GIT_DIR=...` — `gh` uses `git rev-parse` internally and the env var can misdirect it.

---

## Sync-engine on a feature branch

By default the sync-engine auto-detects the current git branch at startup. To pin it to a feature branch regardless of the checked-out state, set `SYNC_ENGINE_TARGET_BRANCH` in `apps/sync-engine/.env`:

```dotenv
SYNC_ENGINE_TARGET_BRANCH=feat/my-branch
```

Without this, if `mountWebhookRoutes()` runs before `engine.start()`, the branch filter falls back to `main` and all webhook deliveries on the feature branch are silently ignored.
