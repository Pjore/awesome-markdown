import { z } from 'zod';
import type { HttpProviderConfig } from '@awesome-markdown/provider-http';

// ---------------------------------------------------------------------------
// ProviderSettings discriminated union
// ---------------------------------------------------------------------------

/** Settings the user can pick in the Settings page; persisted to localStorage. */
export const PersistedProviderSettingsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('localStorage') }),
  z.object({
    kind: z.literal('http'),
    baseUrl: z.string().url(),
  }),
]);

export type PersistedProviderSettings = z.infer<typeof PersistedProviderSettingsSchema>;

/**
 * Runtime-only provider settings injected by a hosting app (e.g.
 * awesome-markdown-cloud). Carries token callbacks, so it is never
 * serialised: `saveProviderSettings` ignores it and `loadProviderSettings`
 * can never return it.
 */
export type CloudProviderSettings = { kind: 'cloud' } & HttpProviderConfig & {
  getToken: NonNullable<HttpProviderConfig['getToken']>;
};

export type ProviderSettings = PersistedProviderSettings | CloudProviderSettings;

export function isPersistableSettings(
  settings: ProviderSettings,
): settings is PersistedProviderSettings {
  return settings.kind !== 'cloud';
}

// VITE_DEFAULT_PROVIDER_KIND lets a deployment default straight to the HTTP
// sidecar instead of localStorage (still overridable via the Settings UI).
const defaultKind = import.meta.env['VITE_DEFAULT_PROVIDER_KIND'];
const defaultBaseUrl = import.meta.env['VITE_PROVIDER_FS_URL'];

export const DEFAULT_SETTINGS: PersistedProviderSettings =
  defaultKind === 'http' && typeof defaultBaseUrl === 'string' && defaultBaseUrl.length > 0
    ? { kind: 'http', baseUrl: defaultBaseUrl }
    : { kind: 'localStorage' };
