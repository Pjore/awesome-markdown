import { z } from 'zod';

export const BoardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Board = z.infer<typeof BoardSchema>;
