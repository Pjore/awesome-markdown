import { z } from 'zod';

export const ItemPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type ItemPriority = z.infer<typeof ItemPrioritySchema>;

export const ItemSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  swimlaneId: z.string(),
  title: z.string(),
  /** Markdown body content */
  body: z.string(),
  status: z.string(),
  priority: ItemPrioritySchema,
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  dueDate: z.string().optional(),
  assignee: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()),
});

export type Item = z.infer<typeof ItemSchema>;
