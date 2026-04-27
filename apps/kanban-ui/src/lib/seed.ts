import type { PersistenceProvider } from '@awesome-markdown/contracts';

/**
 * Seeds localStorage with a deterministic M3 board state:
 * - 1 board ("M3 Test Board")
 * - 3 columns: "To Do", "In Progress", "Done"
 * - 2 swimlanes: "Frontend", "Backend"
 * - 6 items spread across cells
 *
 * Wipes any existing board data before seeding so scenarios start clean.
 */
export async function seedM3(provider: PersistenceProvider): Promise<void> {
  // Delete existing boards and their associated data
  const existing = await provider.listBoards();
  for (const board of existing) {
    const [cols, swimlanes, items] = await Promise.all([
      provider.listColumns(board.id),
      provider.listSwimlanes(board.id),
      provider.listItems(board.id),
    ]);
    await Promise.all(items.map((i) => provider.deleteItem(i.id)));
    await Promise.all(cols.map((c) => provider.deleteColumn(c.id)));
    await Promise.all(swimlanes.map((s) => provider.deleteSwimlane(s.id)));
    await provider.deleteBoard(board.id);
  }

  // Create the seed board
  const board = await provider.createBoard({
    slug: 'm3-test',
    title: 'M3 Test Board',
    description: 'Seeded board for M3 agent-browser scenarios',
  });

  // Create columns
  const [colTodo, colInProgress, colDone] = await Promise.all([
    provider.createColumn({ boardId: board.id, title: 'To Do', order: 0 }),
    provider.createColumn({ boardId: board.id, title: 'In Progress', order: 1 }),
    provider.createColumn({ boardId: board.id, title: 'Done', order: 2 }),
  ]);

  // Create swimlanes
  const [slFrontend, slBackend] = await Promise.all([
    provider.createSwimlane({ boardId: board.id, title: 'Frontend', order: 0 }),
    provider.createSwimlane({ boardId: board.id, title: 'Backend', order: 1 }),
  ]);

  // Create items — 3 per swimlane, distributed across columns

  const itemDefs = [
    {
      title: 'Design login page',
      columnId: colTodo.id,
      swimlaneId: slFrontend.id,
      order: 0,
    },
    {
      title: 'Implement dashboard',
      columnId: colInProgress.id,
      swimlaneId: slFrontend.id,
      order: 0,
    },
    {
      title: 'Write unit tests',
      columnId: colDone.id,
      swimlaneId: slFrontend.id,
      order: 0,
    },
    {
      title: 'Create API schema',
      columnId: colTodo.id,
      swimlaneId: slBackend.id,
      order: 0,
    },
    {
      title: 'Implement auth service',
      columnId: colInProgress.id,
      swimlaneId: slBackend.id,
      order: 0,
    },
    {
      title: 'Deploy to staging',
      columnId: colDone.id,
      swimlaneId: slBackend.id,
      order: 0,
    },
  ] as const;

  await Promise.all(
    itemDefs.map((def) =>
      provider.createItem({
        boardId: board.id,
        columnId: def.columnId,
        swimlaneId: def.swimlaneId,
        title: def.title,
        body: '',
        status: 'open',
        priority: 'medium',
        tags: [],
        customFields: { _order: def.order * 1000 },
      }),
    ),
  );
}
