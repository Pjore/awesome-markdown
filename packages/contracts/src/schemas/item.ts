import { z } from 'zod';
import { PropertyValueSchema, validateItemBounds, validateValues } from '../values.js';

export const SlugSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'Slug must start with alphanumeric and contain only alphanumeric, hyphen, or underscore'
  );
export type Slug = z.infer<typeof SlugSchema>;

/** Only system metadata and the API document body have fixed types. */
const ItemObjectSchema = z
  .object({
    entityType: z.literal('item'),
    slug: SlugSchema,
    body: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .catchall(PropertyValueSchema)
  .superRefine((item, ctx) => {
    try {
      validateItemBounds(item);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid item',
      });
    }
  });
export type Item = z.infer<typeof ItemObjectSchema>;

// Validate without rebuilding the mapping: Zod object parsing groups known keys
// first, which would otherwise change source property order on every save.
export const ItemSchema: z.ZodType<Item> = z.unknown().transform((value, ctx) => {
  try {
    validateValues(value);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid source',
    });
    return z.NEVER;
  }
  const parsed = ItemObjectSchema.safeParse(value);
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) =>
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    );
    return z.NEVER;
  }
  return value as Item;
});

export const ItemRecordSchema = z.object({ item: ItemSchema, revision: z.string().min(1) });
export type ItemRecord = z.infer<typeof ItemRecordSchema>;
