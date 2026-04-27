import { ProviderSettingsSchema, DEFAULT_SETTINGS } from './provider-settings.js';
import type { ProviderSettings } from './provider-settings.js';

const STORAGE_KEY = 'awesome-markdown:provider-settings';

/**
 * Load ProviderSettings from localStorage.
 * Falls back to DEFAULT_SETTINGS on missing or corrupted data.
 */
export function loadProviderSettings(): ProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = ProviderSettingsSchema.safeParse(JSON.parse(raw));
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
 * Persist ProviderSettings to localStorage.
 */
export function saveProviderSettings(settings: ProviderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
