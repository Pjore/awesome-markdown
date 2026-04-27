import { z } from 'zod';

export const ColumnSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  title: z.string(),
  order: z.number().int(),
  wipLimit: z.number().int().positive().optional(),
});

export type Column = z.infer<typeof ColumnSchema>;
