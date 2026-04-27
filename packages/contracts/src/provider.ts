import type { Board } from './schemas/board.js';
import type { Column } from './schemas/column.js';
import type { Item } from './schemas/item.js';
import type { Swimlane } from './schemas/swimlane.js';

// ---------------------------------------------------------------------------
// Provider capabilities discriminator
// ---------------------------------------------------------------------------

export type ProviderCapabilities = { type: 'local' } | { type: 'http'; baseUrl: string };

// ---------------------------------------------------------------------------
// Provider subscription events
// ---------------------------------------------------------------------------

export type ProviderEvent =
  | { type: 'change'; entityId: string; entityType: string }
  | { type: 'synced' }
  | { type: 'offline' };

export type ProviderEventHandler = (event: ProviderEvent) => void;

/** Calling the returned function cancels the subscription. */
export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Input types for create / update operations
// ---------------------------------------------------------------------------

export type CreateBoardInput = Omit<Board, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateBoardInput = Partial<Omit<Board, 'id' | 'createdAt'>>;

export type CreateItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateItemInput = Partial<Omit<Item, 'id' | 'createdAt'>>;

export type CreateColumnInput = Omit<Column, 'id'>;
export type UpdateColumnInput = Partial<Omit<Column, 'id'>>;

export type CreateSwimlaneInput = Omit<Swimlane, 'id'>;
export type UpdateSwimlaneInput = Partial<Omit<Swimlane, 'id'>>;

// ---------------------------------------------------------------------------
// PersistenceProvider interface
// ---------------------------------------------------------------------------

export interface PersistenceProvider {
  readonly capabilities: ProviderCapabilities;

  // -- Boards ----------------------------------------------------------------
  getBoard(id: string): Promise<Board | null>;
  listBoards(): Promise<Board[]>;
  createBoard(data: CreateBoardInput): Promise<Board>;
  updateBoard(id: string, data: UpdateBoardInput): Promise<Board>;
  deleteBoard(id: string): Promise<void>;

  // -- Items -----------------------------------------------------------------
  getItem(id: string): Promise<Item | null>;
  listItems(boardId: string): Promise<Item[]>;
  createItem(data: CreateItemInput): Promise<Item>;
  updateItem(id: string, data: UpdateItemInput): Promise<Item>;
  deleteItem(id: string): Promise<void>;

  // -- Columns ---------------------------------------------------------------
  getColumn(id: string): Promise<Column | null>;
  listColumns(boardId: string): Promise<Column[]>;
  createColumn(data: CreateColumnInput): Promise<Column>;
  updateColumn(id: string, data: UpdateColumnInput): Promise<Column>;
  deleteColumn(id: string): Promise<void>;

  // -- Swimlanes -------------------------------------------------------------
  getSwimlane(id: string): Promise<Swimlane | null>;
  listSwimlanes(boardId: string): Promise<Swimlane[]>;
  createSwimlane(data: CreateSwimlaneInput): Promise<Swimlane>;
  updateSwimlane(id: string, data: UpdateSwimlaneInput): Promise<Swimlane>;
  deleteSwimlane(id: string): Promise<void>;

  // -- Subscriptions ---------------------------------------------------------
  subscribe(handler: ProviderEventHandler): Unsubscribe;
}
