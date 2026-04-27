import { z } from 'zod';

export const SwimlaneSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  title: z.string(),
  order: z.number().int(),
  color: z.string().optional(),
});

export type Swimlane = z.infer<typeof SwimlaneSchema>;
