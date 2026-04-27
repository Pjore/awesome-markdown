import { z } from 'zod';

// ---------------------------------------------------------------------------
// ProviderSettings discriminated union
// ---------------------------------------------------------------------------

export const ProviderSettingsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('localStorage') }),
  z.object({
    kind: z.literal('http'),
    baseUrl: z.string().url(),
  }),
]);

export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

export const DEFAULT_SETTINGS: ProviderSettings = { kind: 'localStorage' };
