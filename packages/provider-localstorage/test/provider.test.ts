import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageProvider } from '../src/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBoard(overrides?: Partial<{ slug: string; title: string }>) {
  return {
    slug: overrides?.slug ?? 'test-board',
    title: overrides?.title ?? 'Test Board',
  };
}

function makeItem(boardId: string, columnId: string, swimlaneId: string) {
  return {
    boardId,
    columnId,
    swimlaneId,
    title: 'Test Item',
    body: '## Description\n\nSome content.',
    status: 'open',
    priority: 'medium' as const,
    tags: ['test'],
    customFields: {},
  };
}

function makeColumn(boardId: string, overrides?: Partial<{ title: string; order: number }>) {
  return {
    boardId,
    title: overrides?.title ?? 'To Do',
    order: overrides?.order ?? 0,
  };
}

function makeSwimlane(boardId: string, overrides?: Partial<{ title: string; order: number }>) {
  return {
    boardId,
    title: overrides?.title ?? 'Default',
    order: overrides?.order ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalStorageProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // -- Board CRUD ------------------------------------------------------------

  describe('Board CRUD', () => {
    it('creates a board and reads it back', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());

      expect(board.id).toBeDefined();
      expect(typeof board.id).toBe('string');
      expect(board.slug).toBe('test-board');
      expect(board.title).toBe('Test Board');
      expect(board.createdAt).toBeDefined();
      expect(board.updatedAt).toBeDefined();

      const fetched = await provider.getBoard(board.id);
      expect(fetched).toEqual(board);
    });

    it('lists all boards', async () => {
      const provider = new LocalStorageProvider();
      await provider.createBoard(makeBoard({ slug: 'board-1', title: 'Board 1' }));
      await provider.createBoard(makeBoard({ slug: 'board-2', title: 'Board 2' }));

      const boards = await provider.listBoards();
      expect(boards).toHaveLength(2);
      expect(boards.map((b) => b.slug).sort()).toEqual(['board-1', 'board-2']);
    });

    it('updates a board', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const updated = await provider.updateBoard(board.id, { title: 'Updated Title' });

      expect(updated.id).toBe(board.id);
      expect(updated.title).toBe('Updated Title');
      expect(updated.slug).toBe(board.slug);
    });

    it('deletes a board', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      await provider.deleteBoard(board.id);

      const fetched = await provider.getBoard(board.id);
      expect(fetched).toBeNull();
    });

    it('returns null for a non-existent board', async () => {
      const provider = new LocalStorageProvider();
      const result = await provider.getBoard('does-not-exist');
      expect(result).toBeNull();
    });

    it('throws when updating a non-existent board', async () => {
      const provider = new LocalStorageProvider();
      await expect(provider.updateBoard('ghost', { title: 'X' })).rejects.toThrow(
        'Board not found: ghost'
      );
    });
  });

  // -- Item CRUD -------------------------------------------------------------

  describe('Item CRUD', () => {
    it('creates an item and reads it back', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const col = await provider.createColumn(makeColumn(board.id));
      const sl = await provider.createSwimlane(makeSwimlane(board.id));

      const item = await provider.createItem(makeItem(board.id, col.id, sl.id));

      expect(item.id).toBeDefined();
      expect(item.boardId).toBe(board.id);
      expect(item.title).toBe('Test Item');

      const fetched = await provider.getItem(item.id);
      expect(fetched).toEqual(item);
    });

    it('lists items filtered by boardId', async () => {
      const provider = new LocalStorageProvider();
      const board1 = await provider.createBoard(makeBoard({ slug: 'b1', title: 'B1' }));
      const board2 = await provider.createBoard(makeBoard({ slug: 'b2', title: 'B2' }));
      const col = await provider.createColumn(makeColumn(board1.id));
      const sl = await provider.createSwimlane(makeSwimlane(board1.id));

      await provider.createItem(makeItem(board1.id, col.id, sl.id));
      await provider.createItem(makeItem(board1.id, col.id, sl.id));
      await provider.createItem(makeItem(board2.id, col.id, sl.id));

      const items1 = await provider.listItems(board1.id);
      expect(items1).toHaveLength(2);

      const items2 = await provider.listItems(board2.id);
      expect(items2).toHaveLength(1);
    });

    it('updates an item', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const col = await provider.createColumn(makeColumn(board.id));
      const sl = await provider.createSwimlane(makeSwimlane(board.id));
      const item = await provider.createItem(makeItem(board.id, col.id, sl.id));

      const updated = await provider.updateItem(item.id, { title: 'New Title', priority: 'high' });
      expect(updated.title).toBe('New Title');
      expect(updated.priority).toBe('high');
      expect(updated.id).toBe(item.id);
    });

    it('deletes an item', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const col = await provider.createColumn(makeColumn(board.id));
      const sl = await provider.createSwimlane(makeSwimlane(board.id));
      const item = await provider.createItem(makeItem(board.id, col.id, sl.id));

      await provider.deleteItem(item.id);
      expect(await provider.getItem(item.id)).toBeNull();
    });
  });

  // -- Column CRUD -----------------------------------------------------------

  describe('Column CRUD', () => {
    it('creates and reads a column', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const col = await provider.createColumn(makeColumn(board.id, { title: 'Backlog', order: 1 }));

      expect(col.id).toBeDefined();
      expect(col.title).toBe('Backlog');
      expect(col.order).toBe(1);

      const fetched = await provider.getColumn(col.id);
      expect(fetched).toEqual(col);
    });

    it('lists columns by boardId', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      await provider.createColumn(makeColumn(board.id, { title: 'Todo', order: 0 }));
      await provider.createColumn(makeColumn(board.id, { title: 'Done', order: 1 }));

      const cols = await provider.listColumns(board.id);
      expect(cols).toHaveLength(2);
    });

    it('updates a column', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const col = await provider.createColumn(makeColumn(board.id));

      const updated = await provider.updateColumn(col.id, { title: 'In Progress', order: 2 });
      expect(updated.title).toBe('In Progress');
    });

    it('deletes a column', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const col = await provider.createColumn(makeColumn(board.id));

      await provider.deleteColumn(col.id);
      expect(await provider.getColumn(col.id)).toBeNull();
    });
  });

  // -- Swimlane CRUD ---------------------------------------------------------

  describe('Swimlane CRUD', () => {
    it('creates and reads a swimlane', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const sl = await provider.createSwimlane(
        makeSwimlane(board.id, { title: 'Sprint 1', order: 0 })
      );

      expect(sl.id).toBeDefined();
      expect(sl.title).toBe('Sprint 1');

      const fetched = await provider.getSwimlane(sl.id);
      expect(fetched).toEqual(sl);
    });

    it('lists swimlanes by boardId', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      await provider.createSwimlane(makeSwimlane(board.id, { title: 'S1', order: 0 }));
      await provider.createSwimlane(makeSwimlane(board.id, { title: 'S2', order: 1 }));

      const swimlanes = await provider.listSwimlanes(board.id);
      expect(swimlanes).toHaveLength(2);
    });

    it('updates a swimlane', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const sl = await provider.createSwimlane(makeSwimlane(board.id));

      const updated = await provider.updateSwimlane(sl.id, { color: '#ff0000' });
      expect(updated.color).toBe('#ff0000');
    });

    it('deletes a swimlane', async () => {
      const provider = new LocalStorageProvider();
      const board = await provider.createBoard(makeBoard());
      const sl = await provider.createSwimlane(makeSwimlane(board.id));

      await provider.deleteSwimlane(sl.id);
      expect(await provider.getSwimlane(sl.id)).toBeNull();
    });
  });

  // -- Subscription fan-out --------------------------------------------------

  describe('subscribe fan-out', () => {
    it('notifies a single subscriber on create', async () => {
      const provider = new LocalStorageProvider();
      const events: unknown[] = [];
      provider.subscribe((event) => events.push(event));

      await provider.createBoard(makeBoard());

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'change', entityType: 'board' });
    });

    it('notifies multiple subscribers (fan-out)', async () => {
      const provider = new LocalStorageProvider();
      const events1: unknown[] = [];
      const events2: unknown[] = [];
      const events3: unknown[] = [];

      provider.subscribe((e) => events1.push(e));
      provider.subscribe((e) => events2.push(e));
      provider.subscribe((e) => events3.push(e));

      const board = await provider.createBoard(makeBoard());
      await provider.updateBoard(board.id, { title: 'Updated' });

      expect(events1).toHaveLength(2);
      expect(events2).toHaveLength(2);
      expect(events3).toHaveLength(2);
    });

    it('unsubscribe stops further notifications', async () => {
      const provider = new LocalStorageProvider();
      const received: unknown[] = [];

      const unsub = provider.subscribe((e) => received.push(e));

      await provider.createBoard(makeBoard({ slug: 'b1', title: 'B1' }));
      expect(received).toHaveLength(1);

      unsub();

      await provider.createBoard(makeBoard({ slug: 'b2', title: 'B2' }));
      // Second create should NOT reach the unsubscribed handler
      expect(received).toHaveLength(1);
    });

    it('surviving subscribers still receive events after one unsubscribes', async () => {
      const provider = new LocalStorageProvider();
      const a: unknown[] = [];
      const b: unknown[] = [];

      const unsubA = provider.subscribe((e) => a.push(e));
      provider.subscribe((e) => b.push(e));

      await provider.createBoard(makeBoard({ slug: 'before', title: 'Before' }));
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);

      unsubA();

      await provider.createBoard(makeBoard({ slug: 'after', title: 'After' }));
      expect(a).toHaveLength(1); // unsubscribed
      expect(b).toHaveLength(2); // still subscribed
    });

    it('emits a change event with the correct entityId', async () => {
      const provider = new LocalStorageProvider();
      const events: Array<{ type: string; entityId: string }> = [];
      provider.subscribe((e) => {
        if (e.type === 'change') {
          events.push({ type: e.type, entityId: e.entityId });
        }
      });

      const board = await provider.createBoard(makeBoard());
      expect(events[0]?.entityId).toBe(board.id);
    });
  });

  // -- Persistence across instances ------------------------------------------

  describe('persistence across instances', () => {
    it('data survives re-instantiation (simulated reload)', async () => {
      const provider1 = new LocalStorageProvider();
      const board = await provider1.createBoard(makeBoard());
      const col = await provider1.createColumn(makeColumn(board.id));
      const sl = await provider1.createSwimlane(makeSwimlane(board.id));
      const item = await provider1.createItem(makeItem(board.id, col.id, sl.id));

      // Create a fresh instance reading from the same localStorage
      const provider2 = new LocalStorageProvider();

      expect(await provider2.getBoard(board.id)).toEqual(board);
      expect(await provider2.getColumn(col.id)).toEqual(col);
      expect(await provider2.getSwimlane(sl.id)).toEqual(sl);
      expect(await provider2.getItem(item.id)).toEqual(item);
    });

    it('mutations from one instance are visible to another', async () => {
      const p1 = new LocalStorageProvider();
      const p2 = new LocalStorageProvider();

      const board = await p1.createBoard(makeBoard());

      // p2 should see the board created by p1
      const boards = await p2.listBoards();
      expect(boards.some((b) => b.id === board.id)).toBe(true);
    });
  });

  // -- Capabilities ----------------------------------------------------------

  describe('capabilities', () => {
    it('reports type: local', () => {
      const provider = new LocalStorageProvider();
      expect(provider.capabilities).toEqual({ type: 'local' });
    });
  });
});
