// ---------------------------------------------------------------------------
// Entity schemas and inferred types
// ---------------------------------------------------------------------------

// Shared building blocks
export { SlugSchema } from './schemas/item.js';
export type { Slug } from './schemas/item.js';

export { DottedPathSchema, FilterLeafSchema, FilterRuleSchema } from './schemas/filter-rule.js';
export type { DottedPath, FilterLeaf, FilterRule } from './schemas/filter-rule.js';

export {
  PropertyValueSchema,
  SetMutationSchema,
  AppendMutationSchema,
  RemoveMutationSchema,
  DeleteMutationSchema,
  MutationSchema,
  WriteOnDropSchema,
} from './schemas/mutation.js';
export type {
  PropertyValue,
  SetMutation,
  AppendMutation,
  RemoveMutation,
  DeleteMutation,
  Mutation,
  WriteOnDrop,
} from './schemas/mutation.js';

// Entity schemas
export { ItemSchema } from './schemas/item.js';
export type { Item } from './schemas/item.js';

export { BoardSchema } from './schemas/board.js';
export type { Board } from './schemas/board.js';

export { AxisOrderSchema, AxisSchema } from './schemas/axis.js';
export type { AxisOrder, Axis } from './schemas/axis.js';

// ---------------------------------------------------------------------------
// Sync-engine event union (used by sync-engine and provider-http)
// ---------------------------------------------------------------------------
export { SyncEventSchema } from './events.js';
export type { SyncEvent } from './events.js';

// ---------------------------------------------------------------------------
// Conflict resolution (M8)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// HTTP/SSE wire DTOs
// ---------------------------------------------------------------------------
export {
  DeleteResponseSchema,
  ErrorResponseSchema,
  SseEnvelopeSchema,
  SsePayloadSchema,
  CellSchema,
  BoardRenderSchema,
  HomelessSchema,
  CreateItemRequestSchema,
  PatchItemRequestSchema,
} from './dtos.js';
export type {
  DeleteResponse,
  ErrorResponse,
  SseEnvelope,
  SsePayload,
  Cell,
  BoardRender,
  Homeless,
  CreateItemRequest,
  PatchItemRequest,
} from './dtos.js';

// ---------------------------------------------------------------------------
// Provider capability stubs (full interface defined in M3)
// ---------------------------------------------------------------------------
export type {
  ProviderCapabilities,
  ProviderEvent,
  ProviderEventHandler,
  Unsubscribe,
} from './provider.js';

