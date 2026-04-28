# Remote-host CDP Attach — Operator-Driven Browser

Use this when the agent runs on a remote host (e.g. a Coder workspace,
SSH dev box, devcontainer, or codespace) and the **operator** wants to
drive a real browser window on their **local** machine while the agent
captures screenshots, console, network, snapshots, and `eval` results
against that same live session.

The trick: run Chrome locally with the DevTools protocol exposed,
forward that port into the remote host, and have `agent-browser`
attach via `--cdp`. One browser, two drivers.

## When to use

- Agent is on a remote host; you (the human) are local.
- You want to interact normally — mouse, keyboard, devtools, extensions,
  file uploads from your local disk — while the agent watches.
- You want the agent to capture artifacts (HAR, annotated screenshots,
  console logs, accessibility snapshots, `localStorage` dumps) of *your*
  session, not a separate headless one.

For passive review only (no operator interaction), prefer
[video-recording.md](video-recording.md) or `agent-browser dashboard`.

## Step 1 — Launch Chrome locally with CDP

Use a **dedicated user-data dir** so this doesn't disturb your everyday
Chrome profile or get blocked by an existing instance.

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-agent-cdp"

# Linux
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-agent-cdp"

# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:USERPROFILE\.chrome-agent-cdp"
```

Verify locally: open `http://localhost:9222/json/version` — you should
see a JSON blob with `webSocketDebuggerUrl`.

> **Security note:** `--remote-debugging-port` exposes full control of
> the browser. Bind only to loopback (default) and never forward it
> over an untrusted network without an authenticated tunnel
> (SSH / Coder / Tailscale / etc.).

## Step 2 — Forward port 9222 into the remote host

Pick whichever applies to your setup.

### Coder workspace

```bash
coder port-forward <workspace-name> --tcp 9222:9222
```

### Plain SSH

```bash
# Reverse-forward: local 9222 becomes remote localhost:9222
ssh -R 9222:localhost:9222 <remote-host>
```

If you already have a long-lived SSH session, add:

```bash
~C            # SSH escape
-R 9222:localhost:9222
```

### GitHub Codespaces / devcontainers

Use the editor's port-forwarding UI to make local `9222` reachable as
`localhost:9222` inside the container.

Sanity check from the remote host:

```bash
curl -s http://localhost:9222/json/version | head -c 200
```

## Step 3 — Attach `agent-browser` from the remote host

```bash
agent-browser --cdp 9222 connect 9222
agent-browser --cdp 9222 open "http://localhost:5173/?seed=m3"
agent-browser --cdp 9222 snapshot -i
```

Once attached, every `agent-browser` invocation that includes `--cdp 9222`
operates on the operator's live tab. Tip: set it once for the shell
session:

```bash
export AGENT_BROWSER_ARGS=""   # not needed; --cdp must stay on the CLI
alias ab='agent-browser --cdp 9222'
ab snapshot -i
ab screenshot --annotate /tmp/now.png
```

## Capturing the operator's session

```bash
# Annotated visual of whatever the operator is looking at
agent-browser --cdp 9222 screenshot --annotate /tmp/state.png

# Full HAR over the next set of operator interactions
agent-browser --cdp 9222 network har start /tmp/session.har
# ... operator clicks around ...
agent-browser --cdp 9222 network har stop

# Console history (full, all levels)
agent-browser --cdp 9222 console

# Page errors
agent-browser --cdp 9222 errors

# Extract app state (awesome-markdown specific)
agent-browser --cdp 9222 eval \
  'JSON.stringify(JSON.parse(localStorage.getItem("awesome-markdown:v1")||"{}"))'

# Accessibility tree of current view
agent-browser --cdp 9222 snapshot -i
```

Refs (`@e1`, …) are still valid for the agent to drive clicks if the
operator wants help — both can interact with the same page.

## awesome-markdown specifics

The `kanban-ui` dev server runs on the **remote host** at port 5173.
The operator's local Chrome reaches it through whatever port-forward
already exposes 5173 (Coder, SSH, etc.). The CDP forward on 9222 is in
addition to — not a replacement for — the existing 5173 forward.

Typical flow once both forwards are up:

```bash
# (operator, locally)
open http://localhost:5173/?seed=m3

# (agent, on remote host)
agent-browser --cdp 9222 connect 9222
agent-browser --cdp 9222 wait --load networkidle
agent-browser --cdp 9222 screenshot --annotate /tmp/board.png
```

Filter the well-known sidecar noise (see
[awesome-markdown-notes.md](awesome-markdown-notes.md)) when reading
console / network capture from this attached session — the seeded UI
still chats with `:7402` and emits expected `ERR_CONNECTION_REFUSED`
when the sync-engine is down.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:9222` on remote | Port-forward not active or Chrome not started with `--remote-debugging-port` | Re-run launch + forward; `curl http://localhost:9222/json/version` should work on the remote |
| Chrome opens but `/json/version` 404s | Existing Chrome instance hijacked the launch and ignored the flag | Quit all Chrome windows, or use a fresh `--user-data-dir` |
| `connect` returns immediately but `snapshot` fails | No active tab — operator closed the tab | Operator opens a tab; agent re-runs `connect` |
| Agent's screenshots are blank | Tab is backgrounded and OS throttled rendering | Bring the tab to the foreground locally |
| HAR is empty | `network har start` was issued *after* the requests fired | Start HAR before the operator triggers the action |

## Limitations vs. an isolated `agent-browser` session

- **Single shared page state.** Agent navigations move the operator's
  view too. Use a second tab if you need a scratch space:
  `agent-browser --cdp 9222 tab new`.
- **No `--headed` flag needed** — the browser is already visible to the
  operator; `--headed` is only meaningful when `agent-browser` launches
  its own Chromium.
- **Profile / extensions are the operator's**, not the agent's. Auth
  state, cookies, and saved passwords come from the local
  `--user-data-dir`. Use a dedicated dir to avoid leaking real creds.
- **Recording with `agent-browser record`** captures via Playwright's
  page-screencast — works over CDP but produces a server-side WebM, not
  a stream of the operator's actual window pixels.

## Alternatives

If running Chrome locally isn't possible, see:

- **Headed Chromium on the remote host + VNC/noVNC** — heavier setup,
  laggier input, but fully self-contained. (Outline only; not yet
  documented as a reference here.)
- **`agent-browser dashboard`** (port 4848) — observability UI the
  operator can open via port-forward to *watch* an agent-driven
  session, but cannot interact with.
- **`agent-browser stream enable`** — runtime WebSocket stream for
  external viewers; also passive.
