import type { PersistenceProvider } from '@awesome-markdown/contracts';
import { LocalStorageProvider } from '@awesome-markdown/provider-localstorage';
import { createHttpProvider } from '@awesome-markdown/provider-http';
import type { ProviderSettings } from '../settings/provider-settings.js';

/**
 * Constructs a PersistenceProvider from a ProviderSettings discriminated union.
 */
export function createProviderFromSettings(settings: ProviderSettings): PersistenceProvider {
  if (settings.kind === 'http') {
    return createHttpProvider({ baseUrl: settings.baseUrl });
  }
  return new LocalStorageProvider();
}
