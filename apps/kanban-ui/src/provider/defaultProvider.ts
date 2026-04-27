import type { PersistenceProvider } from '@awesome-markdown/contracts';
import { LocalStorageProvider } from '@awesome-markdown/provider-localstorage';

let instance: PersistenceProvider | null = null;

/**
 * Returns a singleton instance of the localStorage-backed PersistenceProvider.
 * Construct once at app bootstrap; stable across re-renders.
 */
export function createDefaultProvider(): PersistenceProvider {
  if (instance === null) {
    instance = new LocalStorageProvider();
  }
  return instance;
}
