# Provider API

`apps/provider-fs` uses Fastify and persists Markdown under its configured content root. Settings: `PROVIDER_FS_HOST`, `PROVIDER_FS_PORT`, `PROVIDER_FS_CONTENT_ROOT`.

| Method | Path | Result/action |
|---|---|---|
| GET | `/health` | installed version, `itemProtocol`, content-root metadata |
| GET | `/boards` | board definitions |
| POST | `/boards` | create a board |
| PATCH | `/boards/:slug` | update selected definition fields/axis references |
| DELETE | `/boards/:slug` | remove a board definition |
| GET | `/axes` | axis definitions |
| POST | `/axes` | create an axis |
| PATCH | `/axes/:slug` | update an axis definition |
| DELETE | `/axes/:slug` | remove an axis definition |
| GET | `/boards/:slug/render` | board, axes and cells with items/read-only flags |
| GET | `/boards/:slug/homeless` | `{ board, items }` for candidates matching no column |
| GET | `/items/:slug` | `{ item, revision }` |
| POST | `/items` | create; return `{ item, revision }` |
| PATCH | `/items/:slug` | atomic revision-checked mutation batch; return saved record |
| DELETE | `/items/:slug` | remove an item file |
| GET | `/subscribe` | source change SSE stream |

Enumerate board items through render plus homeless results and deduplicate by slug. Fetch a specific item's authoritative record through its item endpoint.

## Item writes

Creation accepts `slug`, a workflow-convenience `title`, initial `mutations`, and optional API `body`. Existing items may use any supported recursive title value; headings use a nonempty string title or slug.

PATCH accepts the source revision and one complete mutation batch:

```json
{
  "revision": "<opaque source revision>",
  "mutations": [
    {"op":"set","path":["literal.key"],"value":[false,"003",null]}
  ]
}
```

Use the authoritative saved item/revision after success. On conflict, preserve the draft and make an explicit reload/discard decision. Filesystem writes compare current persisted bytes, then commit atomically before index/events are updated. localStorage uses the same item validation/mutation rules.

## Home configuration

The declared board Extension supplies authentication and journaling. home-board 3.1 provides axis inspection and repository-row configuration:

```bash
home board connection --task task-slug
home board board
home board axes
home board rows --repo agent-workspace --repo agentswarm
home board snapshot task-slug
```

Keep private payloads in protected snapshots/JSON stdin. Public package/API metadata and readiness checks establish the remote release in use.
