import { z } from 'zod';
import { BoardSchema } from './schemas/board.js';
import { ColumnSchema } from './schemas/column.js';
import { ItemSchema } from './schemas/item.js';
import { SwimlaneSchema } from './schemas/swimlane.js';
import { SyncEventSchema } from './events.js';

// ---------------------------------------------------------------------------
// Board DTOs
// ---------------------------------------------------------------------------

export const CreateBoardRequestSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});
export type CreateBoardRequest = z.infer<typeof CreateBoardRequestSchema>;

export const UpdateBoardRequestSchema = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type UpdateBoardRequest = z.infer<typeof UpdateBoardRequestSchema>;

export const BoardResponseSchema = BoardSchema;
export type BoardResponse = z.infer<typeof BoardResponseSchema>;

export const BoardsListResponseSchema = z.object({ boards: z.array(BoardSchema) });
export type BoardsListResponse = z.infer<typeof BoardsListResponseSchema>;

// ---------------------------------------------------------------------------
// Item DTOs
// ---------------------------------------------------------------------------

export const CreateItemRequestSchema = ItemSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type CreateItemRequest = z.infer<typeof CreateItemRequestSchema>;

export const UpdateItemRequestSchema = ItemSchema.omit({ id: true, createdAt: true }).partial();
export type UpdateItemRequest = z.infer<typeof UpdateItemRequestSchema>;

export const ItemResponseSchema = ItemSchema;
export type ItemResponse = z.infer<typeof ItemResponseSchema>;

export const ItemsListResponseSchema = z.object({ items: z.array(ItemSchema) });
export type ItemsListResponse = z.infer<typeof ItemsListResponseSchema>;

// ---------------------------------------------------------------------------
// Column DTOs
// ---------------------------------------------------------------------------

export const CreateColumnRequestSchema = ColumnSchema.omit({ id: true });
export type CreateColumnRequest = z.infer<typeof CreateColumnRequestSchema>;

export const UpdateColumnRequestSchema = ColumnSchema.omit({ id: true }).partial();
export type UpdateColumnRequest = z.infer<typeof UpdateColumnRequestSchema>;

export const ColumnResponseSchema = ColumnSchema;
export type ColumnResponse = z.infer<typeof ColumnResponseSchema>;

export const ColumnsListResponseSchema = z.object({ columns: z.array(ColumnSchema) });
export type ColumnsListResponse = z.infer<typeof ColumnsListResponseSchema>;

// ---------------------------------------------------------------------------
// Swimlane DTOs
// ---------------------------------------------------------------------------

export const CreateSwimlaneRequestSchema = SwimlaneSchema.omit({ id: true });
export type CreateSwimlaneRequest = z.infer<typeof CreateSwimlaneRequestSchema>;

export const UpdateSwimlaneRequestSchema = SwimlaneSchema.omit({ id: true }).partial();
export type UpdateSwimlaneRequest = z.infer<typeof UpdateSwimlaneRequestSchema>;

export const SwimlaneResponseSchema = SwimlaneSchema;
export type SwimlaneResponse = z.infer<typeof SwimlaneResponseSchema>;

export const SwimlanesListResponseSchema = z.object({ swimlanes: z.array(SwimlaneSchema) });
export type SwimlanesListResponse = z.infer<typeof SwimlanesListResponseSchema>;

// ---------------------------------------------------------------------------
// Generic response shapes
// ---------------------------------------------------------------------------

export const DeleteResponseSchema = z.object({ ok: z.literal(true) });
export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ---------------------------------------------------------------------------
// SSE wire format
// ---------------------------------------------------------------------------

/**
 * Raw SSE message envelope as received from the sidecar event stream.
 * The `data` field contains a JSON-encoded `SyncEvent`.
 */
export const SseEnvelopeSchema = z.object({
  id: z.string().optional(),
  event: z.string(),
  data: z.string(),
  retry: z.number().optional(),
});
export type SseEnvelope = z.infer<typeof SseEnvelopeSchema>;

/**
 * Parsed SSE payload — after decoding the `data` field.
 */
export const SsePayloadSchema = SyncEventSchema;
export type SsePayload = z.infer<typeof SsePayloadSchema>;
