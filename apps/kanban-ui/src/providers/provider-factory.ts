import type { PersistenceProvider } from '@awesome-markdown/contracts';
import { LocalStorageProvider } from '@awesome-markdown/provider-localstorage';
import { createHttpProvider } from '@awesome-markdown/provider-http';
import type { ProviderSettings } from '../settings/provider-settings.js';

/**
 * Constructs a PersistenceProvider from a ProviderSettings discriminated union.
 */
export function createProviderFromSettings(settings: ProviderSettings): PersistenceProvider {
  switch (settings.kind) {
    case 'http':
      return createHttpProvider({ baseUrl: settings.baseUrl });
    case 'cloud': {
      // Same wire contract as provider-fs, plus auth callbacks from the host.
      const { kind: _kind, ...config } = settings;
      return createHttpProvider(config);
    }
    case 'localStorage':
      return new LocalStorageProvider();
  }
}
