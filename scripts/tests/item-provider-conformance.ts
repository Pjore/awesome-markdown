import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { PersistenceProvider } from '../../packages/contracts/src/index.js';

export function itemProviderConformance(
  setup: () => Promise<{ provider: PersistenceProvider; cleanup: () => Promise<void> }>
): void {
  describe('shared item provider conformance', () => {
    let provider: PersistenceProvider;
    let cleanup: () => Promise<void>;
    beforeEach(async () => {
      ({ provider, cleanup } = await setup());
    });
    afterEach(async () => {
      await cleanup?.();
    });
    const create = async () =>
      provider.createItem({
        slug: 'roundtrip',
        title: 'Initial',
        body: '\nDocument\n\n',
        mutations: [],
      });
    it('saves recursive/literal properties and document text atomically; revision stays outside data', async () => {
      const before = await create();
      const after = await provider.patchItem(before.item.slug, {
        revision: before.revision,
        mutations: [
          { op: 'delete', path: ['title'] },
          { op: 'set', path: ['boards'], value: false },
          {
            op: 'set',
            path: ['a.b\\c'],
            value: [
              '',
              3,
              '003',
              false,
              'false',
              null,
              [],
              {},
              { updatedAt: 'nested', date: '2026-01-01' },
            ],
          },
          { op: 'set', path: ['body'], value: '\n Edited document \n\n' },
        ],
      });
      expect(after.revision).not.toBe(before.revision);
      expect(after.item).not.toHaveProperty('title');
      expect(after.item).not.toHaveProperty('revision');
      expect(after.item.createdAt).toBe(before.item.createdAt);
      expect(after.item['a.b\\c']).toEqual([
        '',
        3,
        '003',
        false,
        'false',
        null,
        [],
        {},
        { updatedAt: 'nested', date: '2026-01-01' },
      ]);
      expect(await provider.getItem(before.item.slug)).toEqual(after);
    });
    it('supports metadata-only items without silently inserting a title', async () => {
      const before = await create();
      const after = await provider.patchItem(before.item.slug, {
        revision: before.revision,
        mutations: [
          { op: 'delete', path: ['title'] },
          { op: 'delete', path: ['body'] },
        ],
      });
      const read = await provider.getItem(after.item.slug);
      expect(read?.item).not.toHaveProperty('title');
      expect(read?.item.slug).toBe('roundtrip');
    });
    it('rejects stale snapshots without writes or success events', async () => {
      const before = await create();
      const saved = await provider.patchItem(before.item.slug, {
        revision: before.revision,
        mutations: [{ op: 'set', path: ['winner'], value: true }],
      });
      const events: unknown[] = [];
      const unsub = provider.subscribe((event) => events.push(event));
      await expect(
        provider.patchItem(before.item.slug, {
          revision: before.revision,
          mutations: [{ op: 'set', path: ['loser'], value: true }],
        })
      ).rejects.toThrow(/changed|conflict/i);
      expect(await provider.getItem(before.item.slug)).toEqual(saved);
      expect(events.filter((event) => (event as { type: string }).type === 'change')).toHaveLength(
        0
      );
      unsub();
    });
    it('serializes competing writes; exactly one matching precondition succeeds', async () => {
      const before = await create();
      const results = await Promise.allSettled(
        [1, 2].map((value) =>
          provider.patchItem(before.item.slug, {
            revision: before.revision,
            mutations: [{ op: 'set', path: ['winner'], value }],
          })
        )
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    });
    it('never recreates an item deleted since the editor snapshot', async () => {
      const before = await create();
      await provider.deleteItem(before.item.slug);
      await expect(
        provider.patchItem(before.item.slug, {
          revision: before.revision,
          mutations: [{ op: 'set', path: ['x'], value: 1 }],
        })
      ).rejects.toThrow();
      expect(await provider.getItem(before.item.slug)).toBeNull();
    });
    it('validates the complete batch before any persisted write', async () => {
      const before = await create();
      for (const key of ['slug', 'entityType', 'createdAt', 'updatedAt']) {
        await expect(
          provider.patchItem(before.item.slug, {
            revision: before.revision,
            mutations: [
              { op: 'set', path: ['ok'], value: 1 },
              { op: 'set', path: [key], value: 'changed' },
            ],
          })
        ).rejects.toThrow();
        expect(await provider.getItem(before.item.slug)).toEqual(before);
      }
      await expect(
        provider.patchItem(before.item.slug, {
          revision: before.revision,
          mutations: [{ op: 'set', path: ['body'], value: 'é'.repeat(262144) }],
        })
      ).rejects.toThrow();
      expect(await provider.getItem(before.item.slug)).toEqual(before);
    });
  });
}
