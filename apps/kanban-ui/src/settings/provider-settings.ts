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

// VITE_DEFAULT_PROVIDER_KIND lets a deployment default straight to the HTTP
// sidecar instead of localStorage (still overridable via the Settings UI).
const defaultKind = import.meta.env['VITE_DEFAULT_PROVIDER_KIND'];
const defaultBaseUrl = import.meta.env['VITE_PROVIDER_FS_URL'];

export const DEFAULT_SETTINGS: ProviderSettings =
  defaultKind === 'http' && typeof defaultBaseUrl === 'string' && defaultBaseUrl.length > 0
    ? { kind: 'http', baseUrl: defaultBaseUrl }
    : { kind: 'localStorage' };
