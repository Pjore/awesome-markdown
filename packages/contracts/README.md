# @awesome-markdown/contracts

Shared Zod v4 schemas, TypeScript interfaces, and HTTP/SSE wire DTOs for the awesome-markdown monorepo. Every cross-package boundary is typed through this package — no duplication.

## Installation

This package is an internal workspace package. Add it as a dependency:

```json
"@awesome-markdown/contracts": "workspace:*"
```

## Contents

### Domain Schemas

| Export | Description |
|--------|-------------|
| `BoardSchema` / `Board` | Board entity (id, slug, title, description, timestamps) |
| `ColumnSchema` / `Column` | Column within a board (id, boardId, title, order, wipLimit) |
| `SwimlaneSchema` / `Swimlane` | Swimlane within a board (id, boardId, title, order, color) |
| `ItemSchema` / `Item` | Kanban card (id, boardId, columnId, swimlaneId, title, body, status, priority, tags, timestamps, dueDate, assignee, customFields) |
| `ItemPrioritySchema` / `ItemPriority` | `'low' \| 'medium' \| 'high' \| 'urgent'` |

### Provider Interface

`PersistenceProvider` is a TypeScript interface (not a Zod schema) implemented by all storage backends:

```typescript
interface PersistenceProvider {
  capabilities: ProviderCapabilities;          // { type: 'local' } | { type: 'http'; baseUrl: string }

  getBoard(id: string): Promise<Board | null>;
  listBoards(): Promise<Board[]>;
  createBoard(data: CreateBoardInput): Promise<Board>;
  updateBoard(id: string, data: UpdateBoardInput): Promise<Board>;
  deleteBoard(id: string): Promise<void>;

  // same pattern for Item, Column, Swimlane …

  subscribe(handler: ProviderEventHandler): Unsubscribe;
}
```

### Sync-Engine Events

`SyncEventSchema` — discriminated union of four event shapes:

| type | Fields | Meaning |
|------|--------|---------|
| `change` | `path`, `entityId` | A file/entity was modified |
| `conflict` | `paths[]`, `diffHunks[]` | Git merge conflict detected |
| `synced` | — | All commits pushed to remote |
| `offline` | — | Remote unreachable |

### HTTP/SSE Wire DTOs

Request/response Zod schemas for the local-fs sidecar REST API and SSE event envelope:

- `CreateBoardRequestSchema`, `UpdateBoardRequestSchema`, `BoardsListResponseSchema`, …
- `SseEnvelopeSchema` — raw SSE message; `SsePayloadSchema` — decoded `SyncEvent` payload

## Usage Example

```typescript
import { BoardSchema, type Board, type PersistenceProvider } from '@awesome-markdown/contracts';

const board: Board = BoardSchema.parse(rawData);
```

## Rules

- No runtime code beyond Zod schema definitions and TypeScript type aliases.
- No `any` — use `unknown` for untyped extension points (`customFields`).
- Single source of truth: all cross-package types derive from schemas here.
