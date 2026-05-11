# M5 Agent-Browser Scenarios

This directory contains the UC-6 acceptance scenarios for Milestone 5:
**HTTP/SSE Provider Client + Runtime Provider Selection**.

## Scenarios

| File | ID | Description |
|------|----|-------------|
| `switch-to-http.scenario.json` | `switch-to-http` | Open settings, select HTTP provider, enter sidecar URL, save; assert board reloads |
| `sse-online-indicator.scenario.json` | `sse-online-indicator` | Assert connection indicator reaches `online` within 5 s after switching to HTTP |
| `sidecar-restart-reconnect.scenario.json` | `sidecar-restart-reconnect` | Restart sidecar out-of-band; assert indicator goes `reconnecting` then `online` |
| `switch-back-isolation.scenario.json` | `switch-back-isolation` | Switch to HTTP, then back to localStorage; assert state isolation |
| `sse-editor-live-refresh.scenario.json` | `sse-editor-live-refresh` | PATCH item externally; assert editor title refreshes via SSE without reload; dirty-guard suppresses overwrite |

## Prerequisites

### Services

1. **kanban-ui dev server** — `pnpm --filter kanban-ui dev` (port 5173)
2. **provider-fs sidecar** — `pnpm --filter provider-fs dev` (port 3001, any content root)

### Scenario: `sidecar-restart-reconnect`

This scenario requires the test harness to restart the sidecar process between actions.
The harness must:
1. Record the sidecar PID after startup.
2. On the `"type": "exec", "command": "restart-sidecar"` step:
   - `kill <sidecar-pid>` to stop the current instance
   - Start a new instance: `pnpm --filter provider-fs start &`
   - Wait until `http://localhost:3001/health` returns 200 before continuing.

### Scenario: `sse-editor-live-refresh`

This scenario verifies two behaviours introduced by `useProviderSubscribe`:

1. **Live-refresh**: when the file is written externally (via PATCH), the item editor
   updates its title input within ~200 ms (100 ms debounce + network round-trip).
2. **Dirty-guard**: when the user has unsaved edits (`dirty=true`), incoming SSE events
   are silently ignored so in-progress work is never overwritten.

The harness must issue `PATCH /items/item-fix-auth-bug` requests on `"command": "patch-item"` steps:

```bash
curl -X PATCH http://localhost:7701/items/item-fix-auth-bug \
  -H "Content-Type: application/json" \
  -d '{"mutations":[{"op":"set","path":"title","value":"SSE live-refreshed title"}]}'
```

The scenario restores the original title via a second PATCH at the end.

## Running Scenarios

```bash
# From repo root:
pnpm --filter kanban-ui verify:m5
```

The `verify:m5` command:
1. Loads all `*.scenario.json` files in this directory.
2. Validates required fields and structure.
3. Exits 0 if all scenarios are structurally valid.

For full end-to-end execution against a live browser, invoke `agent-browser` with
the running dev server and scenario files:

```bash
# Start services
pnpm --filter kanban-ui dev &
pnpm --filter provider-fs dev &

# Run scenarios
node agent-browser/m5/runner.mjs
```

## Cleanup

Each scenario should be run in isolation. Between scenarios:
- Clear `localStorage` via `localStorage.clear()` in the browser
- Restart the sidecar with a fresh content root (`--content /tmp/m5-test-<scenario>`)
