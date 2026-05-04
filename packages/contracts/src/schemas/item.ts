import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slug schema (shared across all entity types)
// ---------------------------------------------------------------------------

/**
 * Entity slug — the primary identity key, namespaced per entityType.
 * Slugs start with an alphanumeric character and contain only
 * alphanumeric characters, hyphens, and underscores.
 *
 * Global uniqueness is NOT enforced here; that is a provider-index concern.
 */
export const SlugSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'Slug must start with alphanumeric and contain only alphanumeric, hyphen, or underscore',
  );

export type Slug = z.infer<typeof SlugSchema>;

// ---------------------------------------------------------------------------
// Per-board property bag
// ---------------------------------------------------------------------------

/**
 * A single entry in `Item.boards[]`.
 *
 * Required: `board` — the board slug this entry belongs to.
 * Optional: `order` — per-board fractional-index order key.
 * Passthrough: arbitrary additional per-board properties are kept
 * unvalidated (e.g. `note`, custom label overrides).
 */
const BoardEntrySchema = z
  .object({
    board: SlugSchema,
    order: z.string().min(1).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Item entity
// ---------------------------------------------------------------------------

/**
 * An `entityType: item` markdown file.
 *
 * System fields (`slug`, `title`, `createdAt`, `updatedAt`, `order`,
 * `boards`) are validated strictly. All other frontmatter properties
 * (e.g. `status`, `priority`, `tags`, `assignee`) are user-defined and
 * pass through unvalidated — their values are evaluated by the filter
 * engine in M2.
 */
export const ItemSchema = z
  .object({
    entityType: z.literal('item'),
    slug: SlugSchema,
    title: z.string().min(1),
    /** Markdown body content (everything after the frontmatter block). */
    body: z.string().optional(),
    /**
     * Global fractional-index order key. Absent if never explicitly ordered.
     * Must be a non-empty string; lexicographic semantics belong to M2.
     */
    order: z.string().min(1).optional(),
    /**
     * Per-board property bags. Each entry scopes extra properties
     * (at minimum `order`) to the referenced board slug.
     *
     * Membership on a board is determined entirely by filter rules;
     * the presence of an entry here does NOT affect board membership.
     */
    boards: z.array(BoardEntrySchema).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export type Item = z.infer<typeof ItemSchema>;
