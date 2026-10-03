import { PersistedProviderSettingsSchema, DEFAULT_SETTINGS, isPersistableSettings } from './provider-settings.js';
import type { CloudProviderSettings, ProviderSettings } from './provider-settings.js';

const STORAGE_KEY = 'awesome-markdown:provider-settings';

/**
 * Global a hosting page may set *before* the kanban-ui bundle loads to run the
 * UI against a cloud backend, e.g.
 *   window.__AWESOME_MARKDOWN_CLOUD_PROVIDER__ = { kind: 'cloud', baseUrl, getToken };
 * Runtime-only: never written to localStorage.
 */
export const CLOUD_PROVIDER_GLOBAL = '__AWESOME_MARKDOWN_CLOUD_PROVIDER__';

/** Returns host-injected cloud settings, or null when absent/malformed. */
export function readInjectedCloudSettings(): CloudProviderSettings | null {
  if (typeof window === 'undefined') return null;
  const raw: unknown = (window as unknown as Record<string, unknown>)[CLOUD_PROVIDER_GLOBAL];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') {
    console.warn('[provider-settings] Injected cloud settings are not an object; ignoring.');
    return null;
  }
  const candidate = raw as Partial<CloudProviderSettings>;
  if (
    candidate.kind !== 'cloud' ||
    typeof candidate.baseUrl !== 'string' ||
    typeof candidate.getToken !== 'function'
  ) {
    console.warn('[provider-settings] Injected cloud settings need kind, baseUrl and getToken; ignoring.');
    return null;
  }
  return candidate as CloudProviderSettings;
}

/**
 * Resolve the initial ProviderSettings.
 * Host-injected cloud settings win; otherwise read localStorage, falling back
 * to DEFAULT_SETTINGS on missing or corrupted data.
 */
export function loadProviderSettings(): ProviderSettings {
  const injected = readInjectedCloudSettings();
  if (injected !== null) return injected;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = PersistedProviderSettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[provider-settings] Stored settings are invalid; using default.');
      return DEFAULT_SETTINGS;
    }
    return parsed.data;
  } catch {
    console.warn('[provider-settings] Failed to read stored settings; using default.');
    return DEFAULT_SETTINGS;
  }
}

/**
 * Persist ProviderSettings to localStorage. Runtime-only `cloud` settings are
 * never persisted (they carry token callbacks and are re-injected per load).
 */
export function saveProviderSettings(settings: ProviderSettings): void {
  if (!isPersistableSettings(settings)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
