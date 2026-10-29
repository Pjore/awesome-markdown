import type { PersistenceProvider, Mutation } from '@awesome-markdown/contracts';

const BOARDS = [
  { slug: 'm3-demo', title: 'Recursive item demo' },
  { slug: 'm3-release', title: 'Release planning demo' },
];

/** Explicit demo provisioning, never an invalid-data fallback or content reset. */
export async function seedM3(provider: PersistenceProvider): Promise<void> {
  if (provider.capabilities.type !== 'local')
    throw new Error(
      'The M3 seed is localStorage-only. Use an isolated content root for HTTP tests.'
    );

  // Both boards reuse these definitions; the current board binds every lookup.
  for (const [slug, title, field, equals] of [
    ['m3-todo', 'To Do', 'status', 'todo'],
    ['m3-doing', 'Doing', 'status', 'doing'],
    ['m3-frontend', 'Frontend', 'team', 'frontend'],
    ['m3-backend', 'Backend', 'team', 'backend'],
  ] as const) {
    const filter = { property: `boards.$board.${field}`, equals };
    const order = { by: 'boards.$board.order', direction: 'asc' as const };
    const existing = await provider.getAxis(slug);
    if (!existing) await provider.createAxis({ slug, title, filter, order });
    else if (
      JSON.stringify(existing.filter) !== JSON.stringify(filter) ||
      JSON.stringify(existing.order) !== JSON.stringify(order)
    )
      await provider.patchAxis(slug, { filter, order });
  }
  for (const { slug, title } of BOARDS) {
    const definition = {
      filter: { property: 'boards.$board.board', equals: slug },
      columns: ['m3-todo', 'm3-doing'],
      swimlanes: ['m3-frontend', 'm3-backend'],
    };
    const existing = await provider.getBoard(slug);
    if (!existing) await provider.createBoard({ slug, title, ...definition });
    else if (
      (Object.keys(definition) as Array<keyof typeof definition>).some(
        (key) => JSON.stringify(existing[key]) !== JSON.stringify(definition[key])
      )
    )
      await provider.patchBoard(slug, definition);
  }
  for (const [index, title] of [
    'Explore properties',
    'Mixed lists',
    'Explicit save',
    'Metadata-only heading',
    'Reorder this item',
    'Filter-only selection',
  ].entries()) {
    const slug = `m3-item-${index + 1}`;
    const entries = [
      {
        board: 'm3-demo',
        status: index < 2 ? 'todo' : 'doing',
        team: index % 2 ? 'backend' : 'frontend',
        order: `${String.fromCharCode(97 + index)}P`,
      },
    ];
    if ([0, 2, 4, 5].includes(index))
      entries.push({
        board: 'm3-release',
        status: index === 0 ? 'doing' : 'todo',
        team: index % 2 ? 'frontend' : 'backend',
        order: `${String.fromCharCode(102 - index)}P`,
      });
    const existing = await provider.getItem(slug);
    if (existing) {
      // Explicitly extend older demo seeds without replacing body, properties,
      // or any existing board entry the tester may already have edited.
      if (existing.item.boards !== undefined && !Array.isArray(existing.item.boards))
        throw new Error(
          `Cannot extend demo ${slug}: boards must be a list. Existing data was not replaced.`
        );
      const mutations: Mutation[] = [];
      for (const entry of entries) {
        const matches = (existing.item.boards ?? []).filter(
          (value) =>
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            value.board === entry.board
        );
        if (matches.length > 1)
          throw new Error(`Cannot extend demo ${slug}: duplicate ${entry.board} entries.`);
        if (matches.length) continue;
        for (const [key, value] of Object.entries(entry))
          mutations.push({
            op: 'set',
            path: ['boards', { selector: 'board', value: entry.board }, key],
            value,
          });
      }
      if (mutations.length)
        await provider.patchItem(slug, { revision: existing.revision, mutations });
      continue;
    }
    const record = await provider.createItem({
      slug,
      title,
      body: '# Markdown document\n\nProperties and this document share one explicit Save/Cancel session.\n',
      mutations: [
        { op: 'set', path: ['boards'], value: entries },
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
      await provider.patchItem(slug, {
        revision: record.revision,
        mutations: [{ op: 'delete', path: ['title'] }],
      });
  }
}
