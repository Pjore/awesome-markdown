import type { PersistenceProvider } from '@awesome-markdown/contracts';

/**
 * Seeds localStorage with a deterministic M9 multi-board state:
 * - Board "Alpha Project" (slug: alpha-project) — 3 cols, 2 swimlanes, 4 items
 * - Board "Beta Project"  (slug: beta-project)  — 3 cols, 2 swimlanes, 4 items
 *
 * Items in each board are intentionally distinct so isolation can be asserted.
 * Wipes any existing board data before seeding so scenarios start clean.
 */
export async function seedM9(provider: PersistenceProvider): Promise<void> {
  // Wipe existing boards
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

  // ── Board A: Alpha Project ────────────────────────────────────────────────
  const boardA = await provider.createBoard({
    slug: 'alpha-project',
    title: 'Alpha Project',
    description: 'First board for M9 isolation testing',
  });

  const [aColTodo, aColDoing, aColDone] = await Promise.all([
    provider.createColumn({ boardId: boardA.id, title: 'To Do', order: 0 }),
    provider.createColumn({ boardId: boardA.id, title: 'Doing', order: 1 }),
    provider.createColumn({ boardId: boardA.id, title: 'Done', order: 2 }),
  ]);

  const [aSlUX, aSlBackend] = await Promise.all([
    provider.createSwimlane({ boardId: boardA.id, title: 'UX', order: 0 }),
    provider.createSwimlane({ boardId: boardA.id, title: 'Backend', order: 1 }),
  ]);

  await Promise.all([
    provider.createItem({
      boardId: boardA.id,
      columnId: aColTodo.id,
      swimlaneId: aSlUX.id,
      title: 'Alpha-UX: wireframes',
      body: '',
      status: 'open',
      priority: 'high',
      tags: [],
      customFields: { _order: 0 },
    }),
    provider.createItem({
      boardId: boardA.id,
      columnId: aColDoing.id,
      swimlaneId: aSlUX.id,
      title: 'Alpha-UX: prototype review',
      body: '',
      status: 'open',
      priority: 'medium',
      tags: [],
      customFields: { _order: 1000 },
    }),
    provider.createItem({
      boardId: boardA.id,
      columnId: aColTodo.id,
      swimlaneId: aSlBackend.id,
      title: 'Alpha-Backend: auth service',
      body: '',
      status: 'open',
      priority: 'high',
      tags: [],
      customFields: { _order: 0 },
    }),
    provider.createItem({
      boardId: boardA.id,
      columnId: aColDone.id,
      swimlaneId: aSlBackend.id,
      title: 'Alpha-Backend: DB schema',
      body: '',
      status: 'closed',
      priority: 'low',
      tags: [],
      customFields: { _order: 1000 },
    }),
  ]);

  // ── Board B: Beta Project ─────────────────────────────────────────────────
  const boardB = await provider.createBoard({
    slug: 'beta-project',
    title: 'Beta Project',
    description: 'Second board for M9 isolation testing',
  });

  const [bColBacklog, bColReview, bColShipped] = await Promise.all([
    provider.createColumn({ boardId: boardB.id, title: 'Backlog', order: 0 }),
    provider.createColumn({ boardId: boardB.id, title: 'Review', order: 1 }),
    provider.createColumn({ boardId: boardB.id, title: 'Shipped', order: 2 }),
  ]);

  const [bSlMobile, bSlInfra] = await Promise.all([
    provider.createSwimlane({ boardId: boardB.id, title: 'Mobile', order: 0 }),
    provider.createSwimlane({ boardId: boardB.id, title: 'Infra', order: 1 }),
  ]);

  await Promise.all([
    provider.createItem({
      boardId: boardB.id,
      columnId: bColBacklog.id,
      swimlaneId: bSlMobile.id,
      title: 'Beta-Mobile: onboarding flow',
      body: '',
      status: 'open',
      priority: 'high',
      tags: [],
      customFields: { _order: 0 },
    }),
    provider.createItem({
      boardId: boardB.id,
      columnId: bColReview.id,
      swimlaneId: bSlMobile.id,
      title: 'Beta-Mobile: push notifications',
      body: '',
      status: 'open',
      priority: 'medium',
      tags: [],
      customFields: { _order: 1000 },
    }),
    provider.createItem({
      boardId: boardB.id,
      columnId: bColBacklog.id,
      swimlaneId: bSlInfra.id,
      title: 'Beta-Infra: CI pipeline',
      body: '',
      status: 'open',
      priority: 'high',
      tags: [],
      customFields: { _order: 0 },
    }),
    provider.createItem({
      boardId: boardB.id,
      columnId: bColShipped.id,
      swimlaneId: bSlInfra.id,
      title: 'Beta-Infra: container registry',
      body: '',
      status: 'closed',
      priority: 'low',
      tags: [],
      customFields: { _order: 1000 },
    }),
  ]);
}
