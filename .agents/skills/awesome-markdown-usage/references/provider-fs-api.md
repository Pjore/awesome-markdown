# provider-fs endpoint reference

`apps/provider-fs`, Fastify v5, reads/writes `content/*.md`. Env vars: `PROVIDER_FS_PORT`, `PROVIDER_FS_HOST`, `PROVIDER_FS_CONTENT_ROOT` (not a bare `PORT`).

| Method | Path | Description |
|---|---|---|
| GET | `/boards` | List all board slugs and titles |
| GET | `/axes` | List all axis slugs and titles |
| GET | `/boards/:slug/render` | Board cells, items per cell, and per-cell invertibility flags |
| GET | `/boards/:slug/homeless` | Items that reference this board in `boards[]` but match no column. Shape: `{ board, items: [] }` — **not** a bare array |
| GET | `/items/:slug` | Fetch a single item |
| POST | `/items` | Create a new item |
| PATCH | `/items/:slug` | Update an item — one file write per call |
| DELETE | `/items/:slug` | Delete an item file |

## Gaps to plan around

- There is **no** generic "list/search all items" endpoint. To enumerate items you must either fetch a specific `:slug`, or crawl `GET /boards`, then `GET /boards/:slug/render` (items nested inside cells) plus `GET /boards/:slug/homeless` for each board.
- A `PATCH` is one file write — batch related field changes into a single call rather than issuing several PATCHes for one logical edit, to keep `sync-engine`'s auto-commit history clean (each write is picked up and committed independently).
