# `agent-browser` vs Built-in Browser Tool — LLM Agent Perspective

Comparison of the VS Code built-in browser tool (`open_browser_page`,
`read_page`, `screenshot_page`, `click_element`, `navigate_page`) versus the
`agent-browser` CLI when used by an LLM coding agent on this project.

**Test target:** `http://localhost:5173/?seed=m3` → `/boards/m3-test` (the M3
seeded kanban board).

---

## TL;DR

| Use case | Recommended tool |
|---|---|
| Quick one-off "does the page render?" check | Built-in |
| Reading text/structure off a page | Either (built-in is zero-setup) |
| Annotated visual layout / spatial reasoning | **agent-browser** (`--annotate`) |
| Drag-and-drop, modals, animations, multi-step flows | **agent-browser** |
| Console log capture (full history, levels) | **agent-browser** (`console`) |
| Network monitoring (HAR, request interception) | **agent-browser** (`network har`, `network route`) |
| Structured data extraction (JSON in, JSON out) | **agent-browser** (`eval --stdin`) |
| Reproducible automation, recorded sessions | **agent-browser** (`record`, `state save`) |
| Frontend regression testing | **agent-browser** (`diff screenshot`, `diff snapshot`) |
| Video walkthroughs of bugs/features | **agent-browser** (`record start/stop`, requires `ffmpeg`) |

**Default:** prefer `agent-browser` for any non-trivial frontend work in this
repo. Use the built-in browser tool only when zero setup matters more than
capability (e.g. confirming a URL loads, fetching a small piece of text).

---

## Detailed Comparison

### 1. Visual — Render, Layout, Alignment

| | Built-in | agent-browser |
|---|---|---|
| Default viewport | ~700 px (truncated 3rd kanban column) | 1280 px (full board visible) |
| Output format | JPEG inline | PNG file on disk |
| Full-page capture | No | `--full` flag |
| Scoped capture | No | `--selector` / `ref` |

**Verdict:** agent-browser. The built-in's narrow viewport hid the "Done"
column on this project's board.

### 2. Visual Debug — Animations, DnD, Modals

| | Built-in | agent-browser |
|---|---|---|
| Element overlay | None | `screenshot --annotate` overlays numbered `[N]` boxes mapped to `@eN` refs |
| Pixel-rect coords | Not exposed | `eval` returns `getBoundingClientRect()` for any selector |
| Video recording | No | `record start <path>` / `record stop` (WebM, requires `ffmpeg`) |
| Diff screenshots | No | `diff screenshot --baseline before.png` |

In this session, agent-browser's annotated screenshot was the only way to
spatially reason about the kanban grid (3 columns × 2 swimlanes × 6 cards)
in a single output.

### 3. Console Log

| | Built-in | agent-browser |
|---|---|---|
| Surface | Passive `Recent events` block in `navigate`/`open` responses (mostly errors, last ~10) | Dedicated `agent-browser console` command, full history, all levels |
| Inject hook | No | `eval` can monkey-patch `console.log` and return a JSON array of captured messages |

`agent-browser console` against this project produced full Vite HMR debug
chatter plus React DevTools info banner — the built-in only surfaced a few
`net::ERR_CONNECTION_REFUSED` errors.

### 4. Network Monitor

| | Built-in | agent-browser |
|---|---|---|
| Passive failures | `(requestFailed)` events in response | — |
| Live request log | No | `network requests` |
| HAR capture | No | `network har start <path>` / `network har stop` (62 requests captured in this test) |
| Request interception / mocking | No | `network route <url-pattern> <action>` |
| Response bodies | No | Included in HAR |

Real example from this session — sidecar connection failures and 62 dev
requests cleanly logged via HAR; the built-in saw only the failures.

### 5. Scraping

| | Built-in | agent-browser |
|---|---|---|
| Primary | `read_page` → ARIA tree | `snapshot -i` → ARIA tree, plus `eval --stdin` heredoc |
| Free JS execution | No | Yes — returns JSON, full DOM + browser API access |
| Scoping | No | `snapshot -s "#selector"` |

Example: extracted full app state from `localStorage["awesome-markdown:v1"]`
in one `eval` call, including the keys `boards`, `items`, `columns`,
`swimlanes`. This is impossible with the built-in tool.

### 6. Automation — Record & Reproduce

| | Built-in | agent-browser |
|---|---|---|
| Interaction primitives | `click_element`, `type_in_page`, `navigate_page` | `click @eN`, `fill`, `press`, `keyboard`, `find {text|role|testid|label}` |
| Semantic locators | Selector-only | `find role button --name "Submit"`, `find testid "..."` |
| State persistence | No | `state save ./auth.json` / `state load` |
| Chained commands | Sequential tool calls | `&&` shell chaining (persistent daemon) |
| Session video | No | `record start/stop` |

For this repo, `find testid "item-card-..."` is dramatically more robust
than CSS selectors against React 19's rendered output.

### 7. Frontend Testing

| | Built-in | agent-browser |
|---|---|---|
| Visual regression | No | `diff screenshot --baseline before.png` |
| Structural regression | No | `diff snapshot --baseline before.txt` |
| Cross-URL diff | No | `diff url <a> <b>` |
| API mocking for tests | No | `network route` |
| Performance profile | No | `profiler start/stop` |

This project already standardises on `agent-browser` for milestone smoke
tests via `pnpm verify:ui` and per-milestone scripts in
[apps/kanban-ui/agent-browser](../apps/kanban-ui/agent-browser).

---

## When to Still Reach for the Built-in Tool

- **Sanity checks during chat where setup time matters**: "does
  `http://localhost:5173` respond at all?"
- **The browser is already open with state** that you want to inspect
  without disturbing it (the built-in tool is in-IDE; the agent-browser
  daemon is a separate session).
- **Rendering an inline screenshot in chat for the user** — built-in
  returns JPEG embedded in the response; agent-browser writes to disk and
  needs a follow-up `view_image`.
- **Quick text scrape of a small page** where ARIA tree from `read_page`
  is enough.

---

## Project-Specific Pitfalls Observed

1. **`?seed=m3` only seeds when the home page is loaded** — navigating
   directly to `/boards/m3-test` after a fresh browser context shows
   "Failed to load board". Always: open `/?seed=m3` → wait
   `networkidle` → click the board link.
2. **Sidecar connection errors are noise during pure UI tests** — the UI
   continually hits `http://localhost:7402/sync/conflict/state` and
   `/events`. Filter these out of console/network output unless that's
   what you're testing.
3. **Default `agent-browser` viewport is wider than built-in** — board
   layouts that look fine in agent-browser may overflow in the built-in's
   ~700 px viewport. Don't trust the built-in for layout debugging.
4. **`agent-browser record` needs `ffmpeg`** — install via
   `sudo apt-get install -y ffmpeg` before recording. WebM output is
   small (~140 KB / minute for this app's UI).
5. **`agent-browser` daemon persists across calls** — if a previous
   session left the browser on a stale URL, `agent-browser close` first
   is faster than fighting refs.

---

## Quick Reference — Common Commands for This Repo

```bash
# Open seeded board, ready for interaction
agent-browser open "http://localhost:5173/?seed=m3" && \
  agent-browser wait --load networkidle && \
  agent-browser click "$(agent-browser snapshot -i | grep -oP '@e\d+(?= link "M3 Test Board)')" && \
  agent-browser wait --load networkidle

# Annotated visual snapshot
agent-browser screenshot --annotate /tmp/board.png

# Full network capture for one navigation
agent-browser network har start /tmp/x.har
agent-browser open "http://localhost:5173/?seed=m3" && agent-browser wait --load networkidle
agent-browser network har stop

# Extract whole app state
agent-browser eval 'JSON.stringify(JSON.parse(localStorage.getItem("awesome-markdown:v1")||"{}"))'

# Visual regression
agent-browser screenshot /tmp/before.png
# ...make changes...
agent-browser diff screenshot --baseline /tmp/before.png
```
