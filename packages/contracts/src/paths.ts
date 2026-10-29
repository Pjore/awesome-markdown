import { z } from 'zod';
import { unsafeKey } from './values.js';

export const DottedPathSchema = z
  .string()
  .regex(
    /^(?:[^.\\]|\\.)+(?:\.(?:[^.\\]|\\.)+)*$/,
    'Use dot-separated segments and escape literal dots/backslashes'
  );
export const PathSegmentSchema = z.union([
  z.string().refine((key) => !unsafeKey(key), 'Unsafe property name'),
  z.number().int().nonnegative().safe(),
  z.object({ selector: z.enum(['board', 'axis']), value: z.string().min(1) }).strict(),
]);
export const MutationPathSchema = z.union([DottedPathSchema, z.array(PathSegmentSchema).min(1)]);
export type MutationPath = z.infer<typeof MutationPathSchema>;
