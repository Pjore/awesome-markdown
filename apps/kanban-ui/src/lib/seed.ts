import type { PersistenceProvider } from '@awesome-markdown/contracts';

/** Explicit development seed; never used as a fallback for invalid persisted data. */
export async function seedM3(provider: PersistenceProvider): Promise<void> {
  if (provider.capabilities.type !== 'local')
    throw new Error(
      'The M3 seed is localStorage-only. Use an isolated content root for HTTP tests.'
    );
  if (await provider.getBoard('m3-demo')) return;
  for (const [slug, title, property, equals] of [
    ['m3-todo', 'To Do', 'status', 'todo'],
    ['m3-doing', 'Doing', 'status', 'doing'],
    ['m3-frontend', 'Frontend', 'team', 'frontend'],
    ['m3-backend', 'Backend', 'team', 'backend'],
  ]) {
    await provider.createAxis({
      slug: slug!,
      title: title!,
      filter: { property: property!, equals: equals! },
      order: { by: 'rank', direction: 'asc' },
    });
  }
  await provider.createBoard({
    slug: 'm3-demo',
    title: 'Recursive item demo',
    filter: { property: 'board', equals: 'm3-demo' },
    columns: ['m3-todo', 'm3-doing'],
    swimlanes: ['m3-frontend', 'm3-backend'],
  });
  for (const [index, title] of [
    'Explore properties',
    'Mixed lists',
    'Explicit save',
    'Metadata-only heading',
    'Reorder this item',
    'Filter-only selection',
  ].entries()) {
    const record = await provider.createItem({
      slug: `m3-item-${index + 1}`,
      title,
      body: '# Markdown document\n\nProperties and this document share one explicit Save/Cancel session.\n',
      mutations: [
        { op: 'set', path: ['board'], value: 'm3-demo' },
        { op: 'set', path: ['status'], value: index < 2 ? 'todo' : 'doing' },
        { op: 'set', path: ['team'], value: index % 2 ? 'backend' : 'frontend' },
        { op: 'set', path: ['rank'], value: `${String.fromCharCode(97 + index)}P` },
        { op: 'set', path: ['code'], value: '003' },
        { op: 'set', path: ['count'], value: 3 },
        {
          op: 'set',
          path: ['mixed'],
          value: [
            false,
            'false',
            null,
            [],
            {},
            { createdAt: 'Nested names remain editable', 'literal.key': '' },
          ],
        },
      ],
    });
    if (index === 3)
      await provider.patchItem(record.item.slug, {
        revision: record.revision,
        mutations: [{ op: 'delete', path: ['title'] }],
      });
  }
}
