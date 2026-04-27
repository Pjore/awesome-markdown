# agent-browser — awesome-markdown Project Notes

Project-specific findings for using `agent-browser` against this repo's UI.

## Default URLs

| Service | URL |
|---|---|
| kanban-ui | `http://localhost:5173` |
| Seeded M3 demo (entry point) | `http://localhost:5173/?seed=m3` |
| Specific board page | `http://localhost:5173/boards/<slug>` |
| provider-fs sidecar | `http://localhost:7701` (or `PROVIDER_FS_PORT`) |
| sync-engine | `http://localhost:7402` |

## Seeding Boards — Critical

The `?seed=m{N}` query parameters only run on the **home page** and write
into `localStorage["awesome-markdown:v1"]`. **Do not** open
`/boards/<slug>` directly after a fresh browser context — the board will
not exist and the UI shows "Failed to load board".

Correct flow:

```bash
agent-browser open "http://localhost:5173/?seed=m3"
agent-browser wait --load networkidle
# Now navigate or click into the board
agent-browser find text "M3 Test Board" click
agent-browser wait --load networkidle
```

If `find text` returns "Element not found" but the URL changed, the seed
didn't run — re-open with `?seed=m3` and confirm via:

```bash
agent-browser eval 'Object.keys(JSON.parse(localStorage.getItem("awesome-markdown:v1")||"{\"boards\":{}}").boards).length'
# Should be > 0
```

## Useful `data-testid` Patterns

The UI ships stable testids. Prefer `find testid` over CSS selectors:

| Pattern | Element |
|---|---|
| `app-header` | Top app bar |
| `board` | Whole board container |
| `board-title` | `<h1>` board title |
| `column-header-<columnId>` | Column header div |
| `swimlane-row-<swimlaneId>` | Whole swimlane row |
| `swimlane-label-<swimlaneId>` | Swimlane label cell |
| `cell-<columnId>-<swimlaneId>` | DnD drop target cell |
| `item-card-<itemId>` | Draggable card |
| `connection-indicator` | Sync status pill |
| `settings-btn` | ⚙ button |

```bash
agent-browser find testid "settings-btn" click
```

## Drag-and-Drop (@dnd-kit)

`@dnd-kit` uses pointer events, not native HTML5 drag. To simulate a card
move you need real mouse-down → mouse-move → mouse-up at pixel
coordinates. Use `eval` to fetch source/target rects, then drive Playwright
mouse via the `--stdin` script form (see
[references/commands.md](commands.md)).

Tip: take an `--annotate` screenshot first so you can verify the visual
result against `[N]` labels after the drop.

## Filtering Noise

The UI continuously polls `http://localhost:7402/sync/conflict/state` and
`/events` (sync-engine SSE). When sync-engine isn't running you'll see a
flood of `net::ERR_CONNECTION_REFUSED`. Filter:

```bash
agent-browser console | grep -v "ERR_CONNECTION_REFUSED" | grep -v "vite"
agent-browser network har start /tmp/x.har
# ...
agent-browser network har stop
# Then in the HAR, ignore entries to :7402
```

## Existing Verification Scripts

The repo has agent-browser smoke suites; reuse or extend rather than
rewriting flows from scratch:

- `apps/kanban-ui/agent-browser/m3/`
- `apps/kanban-ui/agent-browser/m5/`
- `apps/kanban-ui/agent-browser/m8/`
- `apps/kanban-ui/agent-browser/m9/`

Aggregate runner: `pnpm verify:ui`. Per-milestone:
`pnpm --filter kanban-ui verify:m3` etc.

## Recording (WebM)

`agent-browser record` requires `ffmpeg`:

```bash
sudo apt-get install -y ffmpeg   # one-time
agent-browser record start /tmp/demo.webm
# ...interactions...
agent-browser record stop
```

Files are small (~140 KB / minute for this app). Useful for attaching
to PR comments demonstrating UI behaviour.

## When the Built-in Browser Tool Wins

See [/docs/agent-browser-vs-browser-tool.md](../../../../docs/agent-browser-vs-browser-tool.md)
for the full comparison. Short version: built-in is fine for "does the
URL load?" checks during chat. For everything else (layout, DnD,
network, scraping, regression), use `agent-browser`.
