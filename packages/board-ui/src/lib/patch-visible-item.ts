import type { Item, Mutation, PersistenceProvider } from '@awesome-markdown/contracts';

/** Acquire an opaque revision only if the visible source is still authoritative. */
export async function patchVisibleItem(
  provider: PersistenceProvider,
  visible: Item,
  mutations: Mutation[]
): Promise<void> {
  const current = await provider.getItem(visible.slug);
  if (!current) throw new Error('Item was deleted. Reload the board.');
  if (JSON.stringify(current.item) !== JSON.stringify(visible))
    throw new Error('Item changed. Reload the board before moving it.');
  await provider.patchItem(visible.slug, { revision: current.revision, mutations });
}
