// Schemas and inferred types
export { BoardSchema } from './schemas/board.js';
export type { Board } from './schemas/board.js';

export { ColumnSchema } from './schemas/column.js';
export type { Column } from './schemas/column.js';

export { SwimlaneSchema } from './schemas/swimlane.js';
export type { Swimlane } from './schemas/swimlane.js';

export { ItemSchema, ItemPrioritySchema } from './schemas/item.js';
export type { Item, ItemPriority } from './schemas/item.js';

// Provider interface and related types
export type {
  ProviderCapabilities,
  ProviderEvent,
  ProviderEventHandler,
  Unsubscribe,
  CreateBoardInput,
  UpdateBoardInput,
  CreateItemInput,
  UpdateItemInput,
  CreateColumnInput,
  UpdateColumnInput,
  CreateSwimlaneInput,
  UpdateSwimlaneInput,
  PersistenceProvider,
} from './provider.js';

// Sync-engine event union
export { SyncEventSchema } from './events.js';
export type { SyncEvent } from './events.js';

// Conflict resolution (M8)
export type {
  ResolveDecision,
  ConflictPathEntry,
  ConflictState,
  ResolveRequest,
  ResolveResponse,
  OpenExternalRequest,
  OpenExternalResponse,
  InjectConflictRequest,
} from './conflict.js';

// HTTP/SSE wire DTOs
export {
  CreateBoardRequestSchema,
  UpdateBoardRequestSchema,
  BoardResponseSchema,
  BoardsListResponseSchema,
  CreateItemRequestSchema,
  UpdateItemRequestSchema,
  ItemResponseSchema,
  ItemsListResponseSchema,
  CreateColumnRequestSchema,
  UpdateColumnRequestSchema,
  ColumnResponseSchema,
  ColumnsListResponseSchema,
  CreateSwimlaneRequestSchema,
  UpdateSwimlaneRequestSchema,
  SwimlaneResponseSchema,
  SwimlanesListResponseSchema,
  DeleteResponseSchema,
  ErrorResponseSchema,
  SseEnvelopeSchema,
  SsePayloadSchema,
} from './dtos.js';
export type {
  CreateBoardRequest,
  UpdateBoardRequest,
  BoardResponse,
  BoardsListResponse,
  CreateItemRequest,
  UpdateItemRequest,
  ItemResponse,
  ItemsListResponse,
  CreateColumnRequest,
  UpdateColumnRequest,
  ColumnResponse,
  ColumnsListResponse,
  CreateSwimlaneRequest,
  UpdateSwimlaneRequest,
  SwimlaneResponse,
  SwimlanesListResponse,
  DeleteResponse,
  ErrorResponse,
  SseEnvelope,
  SsePayload,
} from './dtos.js';
