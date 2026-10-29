import { describe, it, expect, vi } from 'vitest';
import { LocalStorageProvider } from '../src/index.js';
import { itemProviderConformance } from '../../../scripts/tests/item-provider-conformance.js';

itemProviderConformance(async () => {
  localStorage.clear();
  return {
    provider: new LocalStorageProvider(),
    cleanup: async () => {
      localStorage.clear();
    },
  };
});

describe('localStorage source integrity', () => {
  it('surfaces invalid and unsafe-number source without overwriting or substituting an empty store', async () => {
    const provider = new LocalStorageProvider();
    const source =
      '{"item:unsafe":{"entityType":"item","slug":"unsafe","createdAt":"x","updatedAt":"x","value":9007199254740991.1}}';
    localStorage.setItem('awesome-markdown:v2', source);
    await expect(provider.getItem('unsafe')).rejects.toThrow(/numeric source/);
    await expect(
      provider.createItem({ slug: 'new', title: 'New', mutations: [] })
    ).rejects.toThrow();
    expect(localStorage.getItem('awesome-markdown:v2')).toBe(source);
    localStorage.setItem('awesome-markdown:v2', '{broken JSON');
    await expect(provider.getItem('unsafe')).rejects.toThrow(/Unable to load/);
    expect(localStorage.getItem('awesome-markdown:v2')).toBe('{broken JSON');
    localStorage.clear();
  });
  it('does not report a persisted save as failed when a subscriber throws', async () => {
    localStorage.clear();
    const provider = new LocalStorageProvider();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unsubscribe = provider.subscribe(() => {
      throw new Error('Subscriber failed');
    });
    try {
      const saved = await provider.createItem({ slug: 'saved', title: 'Saved', mutations: [] });
      expect(await provider.getItem('saved')).toEqual(saved);
      expect(warning).toHaveBeenCalled();
    } finally {
      unsubscribe();
      warning.mockRestore();
      localStorage.clear();
    }
  });
});
