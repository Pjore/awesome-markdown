import { z } from 'zod';
import {
  BoardSchema,
  ColumnSchema,
  ItemSchema,
  SwimlaneSchema,
} from '@awesome-markdown/contracts';
import type {
  Board,
  Column,
  Item,
  Swimlane,
  PersistenceProvider,
  ProviderCapabilities,
  ProviderEventHandler,
  Unsubscribe,
  CreateBoardInput,
  UpdateBoardInput,
  CreateItemInput,
  UpdateItemInput,
  CreateColumnInput,
  UpdateColumnInput,
  CreateSwimlaneInput,
  UpdateSwimlaneInput,
} from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Storage schema
// ---------------------------------------------------------------------------

const StorageBlobSchema = z.object({
  boards: z.record(z.string(), BoardSchema),
  items: z.record(z.string(), ItemSchema),
  columns: z.record(z.string(), ColumnSchema),
  swimlanes: z.record(z.string(), SwimlaneSchema),
});

type StorageBlob = z.infer<typeof StorageBlobSchema>;

const EMPTY_BLOB: StorageBlob = {
  boards: {},
  items: {},
  columns: {},
  swimlanes: {},
};

// ---------------------------------------------------------------------------
// LocalStorageProvider
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'awesome-markdown:v1';

export class LocalStorageProvider implements PersistenceProvider {
  readonly capabilities: ProviderCapabilities = { type: 'local' };

  private readonly subscribers = new Set<ProviderEventHandler>();

  // -- Internal helpers -------------------------------------------------------

  private read(): StorageBlob {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return structuredClone(EMPTY_BLOB);
    try {
      return StorageBlobSchema.parse(JSON.parse(raw));
    } catch {
      // Corrupted data — reset to empty blob
      return structuredClone(EMPTY_BLOB);
    }
  }

  private write(blob: StorageBlob): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  }

  private notify(entityId: string, entityType: string): void {
    const event = { type: 'change' as const, entityId, entityType };
    for (const handler of this.subscribers) {
      handler(event);
    }
  }

  // -- Subscriptions ----------------------------------------------------------

  subscribe(handler: ProviderEventHandler): Unsubscribe {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  // -- Boards -----------------------------------------------------------------

  async getBoard(id: string): Promise<Board | null> {
    const blob = this.read();
    return blob.boards[id] ?? null;
  }

  async listBoards(): Promise<Board[]> {
    return Object.values(this.read().boards);
  }

  async createBoard(data: CreateBoardInput): Promise<Board> {
    const blob = this.read();
    const now = new Date().toISOString();
    const board: Board = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    blob.boards[board.id] = board;
    this.write(blob);
    this.notify(board.id, 'board');
    return board;
  }

  async updateBoard(id: string, data: UpdateBoardInput): Promise<Board> {
    const blob = this.read();
    const existing = blob.boards[id];
    if (existing === undefined) {
      throw new Error(`Board not found: ${id}`);
    }
    const updated: Board = {
      ...existing,
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };
    blob.boards[id] = updated;
    this.write(blob);
    this.notify(id, 'board');
    return updated;
  }

  async deleteBoard(id: string): Promise<void> {
    const blob = this.read();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete blob.boards[id];
    this.write(blob);
    this.notify(id, 'board');
  }

  // -- Items ------------------------------------------------------------------

  async getItem(id: string): Promise<Item | null> {
    return this.read().items[id] ?? null;
  }

  async listItems(boardId: string): Promise<Item[]> {
    return Object.values(this.read().items).filter((item) => item.boardId === boardId);
  }

  async createItem(data: CreateItemInput): Promise<Item> {
    const blob = this.read();
    const now = new Date().toISOString();
    const item: Item = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    blob.items[item.id] = item;
    this.write(blob);
    this.notify(item.id, 'item');
    return item;
  }

  async updateItem(id: string, data: UpdateItemInput): Promise<Item> {
    const blob = this.read();
    const existing = blob.items[id];
    if (existing === undefined) {
      throw new Error(`Item not found: ${id}`);
    }
    const updated: Item = {
      ...existing,
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };
    blob.items[id] = updated;
    this.write(blob);
    this.notify(id, 'item');
    return updated;
  }

  async deleteItem(id: string): Promise<void> {
    const blob = this.read();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete blob.items[id];
    this.write(blob);
    this.notify(id, 'item');
  }

  // -- Columns ----------------------------------------------------------------

  async getColumn(id: string): Promise<Column | null> {
    return this.read().columns[id] ?? null;
  }

  async listColumns(boardId: string): Promise<Column[]> {
    return Object.values(this.read().columns).filter((col) => col.boardId === boardId);
  }

  async createColumn(data: CreateColumnInput): Promise<Column> {
    const blob = this.read();
    const column: Column = { ...data, id: crypto.randomUUID() };
    blob.columns[column.id] = column;
    this.write(blob);
    this.notify(column.id, 'column');
    return column;
  }

  async updateColumn(id: string, data: UpdateColumnInput): Promise<Column> {
    const blob = this.read();
    const existing = blob.columns[id];
    if (existing === undefined) {
      throw new Error(`Column not found: ${id}`);
    }
    const updated: Column = { ...existing, ...data, id };
    blob.columns[id] = updated;
    this.write(blob);
    this.notify(id, 'column');
    return updated;
  }

  async deleteColumn(id: string): Promise<void> {
    const blob = this.read();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete blob.columns[id];
    this.write(blob);
    this.notify(id, 'column');
  }

  // -- Swimlanes --------------------------------------------------------------

  async getSwimlane(id: string): Promise<Swimlane | null> {
    return this.read().swimlanes[id] ?? null;
  }

  async listSwimlanes(boardId: string): Promise<Swimlane[]> {
    return Object.values(this.read().swimlanes).filter((sl) => sl.boardId === boardId);
  }

  async createSwimlane(data: CreateSwimlaneInput): Promise<Swimlane> {
    const blob = this.read();
    const swimlane: Swimlane = { ...data, id: crypto.randomUUID() };
    blob.swimlanes[swimlane.id] = swimlane;
    this.write(blob);
    this.notify(swimlane.id, 'swimlane');
    return swimlane;
  }

  async updateSwimlane(id: string, data: UpdateSwimlaneInput): Promise<Swimlane> {
    const blob = this.read();
    const existing = blob.swimlanes[id];
    if (existing === undefined) {
      throw new Error(`Swimlane not found: ${id}`);
    }
    const updated: Swimlane = { ...existing, ...data, id };
    blob.swimlanes[id] = updated;
    this.write(blob);
    this.notify(id, 'swimlane');
    return updated;
  }

  async deleteSwimlane(id: string): Promise<void> {
    const blob = this.read();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete blob.swimlanes[id];
    this.write(blob);
    this.notify(id, 'swimlane');
  }
}
