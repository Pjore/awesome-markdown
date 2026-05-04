import { z } from 'zod';
import { SyncEventSchema } from './events.js';
import { ItemSchema, SlugSchema } from './schemas/item.js';
import { BoardSchema } from './schemas/board.js';
import { AxisSchema } from './schemas/axis.js';
import { MutationSchema } from './schemas/mutation.js';

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

// ---------------------------------------------------------------------------
// Cell — one (column × swimlane) intersection in a board render
// ---------------------------------------------------------------------------

export const CellSchema = z.object({
  columnSlug: SlugSchema,
  swimlaneSlug: SlugSchema,
  /**
   * `true` when the combined filter (board ∧ column ∧ swimlane) is
   * non-invertible and no `writeOnDrop` override resolves it. Read-only
   * cells reject drag-drop and hide the "+ Add" affordance.
   */
  readOnly: z.boolean(),
  items: z.array(ItemSchema),
});
export type Cell = z.infer<typeof CellSchema>;

// ---------------------------------------------------------------------------
// BoardRender DTO — GET /boards/:slug/render response
// ---------------------------------------------------------------------------

/**
 * Complete render envelope for a board.
 *
 * `axes.columns` and `axes.swimlanes` are ordered axis objects corresponding
 * to the board's `columns` and `swimlanes` slug arrays. Axes synthesized
 * from a missing definition file carry `synthetic: true`.
 *
 * `cells` is the full Cartesian product of (column × swimlane) pairs,
 * each pre-populated with matching items.
 */
export const BoardRenderSchema = z.object({
  board: BoardSchema,
  axes: z.object({
    columns: z.array(AxisSchema),
    swimlanes: z.array(AxisSchema),
  }),
  cells: z.array(CellSchema),
});
export type BoardRender = z.infer<typeof BoardRenderSchema>;

// ---------------------------------------------------------------------------
// Homeless DTO — GET /boards/:slug/homeless response
// ---------------------------------------------------------------------------

/**
 * Items that carry a `boards[]` entry for this board but whose properties
 * no longer match any column filter. Surfaced for cleanup or re-triage.
 */
export const HomelessSchema = z.object({
  board: BoardSchema,
  items: z.array(ItemSchema),
});
export type Homeless = z.infer<typeof HomelessSchema>;

// ---------------------------------------------------------------------------
// POST /items request body
// ---------------------------------------------------------------------------

/**
 * Create a new item.
 *
 * `slug` is auto-derived from `title` by the UI (slugify + numeric suffix
 * on collision). `mutations` carry the initial write derived from the
 * destination cell's combined filter (same derivation as drag-drop).
 */
export const CreateItemRequestSchema = z.object({
  slug: SlugSchema,
  title: z.string().min(1),
  mutations: z.array(MutationSchema),
  body: z.string().optional(),
});
export type CreateItemRequest = z.infer<typeof CreateItemRequestSchema>;

// ---------------------------------------------------------------------------
// PATCH /items/:slug request body
// ---------------------------------------------------------------------------

/**
 * Apply a list of mutations to an existing item. Single-file write.
 * At least one mutation must be present.
 */
export const PatchItemRequestSchema = z.object({
  mutations: z.array(MutationSchema).min(1),
});
export type PatchItemRequest = z.infer<typeof PatchItemRequestSchema>;
