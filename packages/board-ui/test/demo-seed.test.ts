import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageProvider } from '@awesome-markdown/provider-localstorage';
import { seedM3 } from '../../../apps/kanban-ui/src/lib/seed.js';

beforeEach(() => localStorage.clear());

describe('contextual two-board demo seed', () => {
  it('uses the same contextual axes for two filter-only boards with different projections', async () => {
    const provider = new LocalStorageProvider();
    await seedM3(provider);
    expect((await provider.listBoards()).map((board) => board.slug)).toEqual([
      'm3-demo',
      'm3-release',
    ]);
    for (const board of await provider.listBoards())
      expect(board.filter).toEqual({ property: 'boards.$board.board', equals: board.slug });
    for (const axis of await provider.listAxes()) {
      expect('property' in axis.filter! && axis.filter.property).toMatch(/^boards\.\$board\./);
      expect(axis.order?.by).toBe('boards.$board.order');
    }
    const main = await provider.getBoardRender('m3-demo');
    const release = await provider.getBoardRender('m3-release');
    expect(main.cells.flatMap((cell) => cell.items)).toHaveLength(6);
    expect(release.cells.flatMap((cell) => cell.items)).toHaveLength(4);
    expect(
      main.cells.find((cell) => cell.items.some((item) => item.slug === 'm3-item-1'))
    ).toMatchObject({ columnSlug: 'm3-todo', swimlaneSlug: 'm3-frontend' });
    expect(
      release.cells.find((cell) => cell.items.some((item) => item.slug === 'm3-item-1'))
    ).toMatchObject({ columnSlug: 'm3-doing', swimlaneSlug: 'm3-backend' });
    const item = (await provider.getItem('m3-item-1'))!.item;
    for (const key of ['board', 'status', 'team', 'rank']) expect(item).not.toHaveProperty(key);
  });
  it('is idempotent and preserves edited body, properties and existing board-scoped values', async () => {
    const provider = new LocalStorageProvider();
    await seedM3(provider);
    const before = (await provider.getItem('m3-item-1'))!;
    const edited = await provider.patchItem('m3-item-1', {
      revision: before.revision,
      mutations: [
        { op: 'set', path: ['body'], value: '# My own Markdown\nKeep this.\n' },
        { op: 'set', path: ['custom'], value: { keep: true } },
        {
          op: 'set',
          path: ['boards', { selector: 'board', value: 'm3-release' }, 'status'],
          value: 'custom-status',
        },
      ],
    });
    const events: unknown[] = [];
    const unsubscribe = provider.subscribe((event) => events.push(event));
    await seedM3(provider);
    unsubscribe();
    expect(await provider.getItem('m3-item-1')).toEqual(edited);
    expect(events).toHaveLength(0);
    expect(
      (await provider.getBoardRender('m3-demo')).cells.flatMap((cell) => cell.items)
    ).toHaveLength(6);
  });
  it('extends an older scalar-property seed without overwriting user content', async () => {
    const provider = new LocalStorageProvider();
    await provider.createBoard({
      slug: 'm3-demo',
      title: 'Existing demo',
      filter: { property: 'board', equals: 'm3-demo' },
    });
    const old = await provider.createItem({
      slug: 'm3-item-3',
      title: 'Explicit save',
      body: '# Markdown document\n\nMy own text.\n',
      mutations: [{ op: 'set', path: ['custom'], value: 'preserve' }],
    });
    await seedM3(provider);
    const extended = (await provider.getItem('m3-item-3'))!.item;
    expect(extended.body).toBe(old.item.body);
    expect(extended.custom).toBe('preserve');
    expect(extended.boards).toHaveLength(2);
    expect(await provider.listBoards()).toHaveLength(2);
    expect((await provider.getBoard('m3-demo'))?.filter).toEqual({
      property: 'boards.$board.board',
      equals: 'm3-demo',
    });
  });
});
