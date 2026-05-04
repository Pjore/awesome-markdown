import type { Board } from './schemas/board.js';
import type { Axis } from './schemas/axis.js';
import type { Item } from './schemas/item.js';
import type { BoardRender, Homeless, CreateItemRequest, PatchItemRequest } from './dtos.js';

// ---------------------------------------------------------------------------
// Provider capabilities discriminator
// ---------------------------------------------------------------------------

export type ProviderCapabilities = { type: 'local' } | { type: 'http'; baseUrl: string };

// ---------------------------------------------------------------------------
// Provider subscription events
// ---------------------------------------------------------------------------

export type ProviderEvent =
  | { type: 'change'; entitySlug: string; entityType: 'item' | 'board' | 'axis' }
  | { type: 'synced' }
  | { type: 'offline'; reason?: string };

export type ProviderEventHandler = (event: ProviderEvent) => void;

/** Calling the returned function cancels the subscription. */
export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// PersistenceProvider interface
// ---------------------------------------------------------------------------

/**
 * Common surface exposed by all persistence backends:
 * provider-localstorage (browser) and provider-http (HTTP → provider-fs).
 *
 * All entity identity is slug-based. Render and homeless DTOs are surfaced
 * as first-class methods backed by filter-engine evaluation.
 */
export interface PersistenceProvider {
  readonly capabilities: ProviderCapabilities;

  /** Subscribe to change / synced / offline events. Returns unsubscribe fn. */
  subscribe(handler: ProviderEventHandler): Unsubscribe;

  // -- Boards ----------------------------------------------------------------
  listBoards(): Promise<Board[]>;
  getBoard(slug: string): Promise<Board | null>;

  // -- Axes ------------------------------------------------------------------
  listAxes(): Promise<Axis[]>;
  getAxis(slug: string): Promise<Axis | null>;

  // -- Render / Homeless -----------------------------------------------------
  /** Full render envelope for a board: cells × axes × items. */
  getBoardRender(slug: string): Promise<BoardRender>;

  /** Items belonging to a board that match no column filter. */
  getHomeless(boardSlug: string): Promise<Homeless>;

  // -- Items -----------------------------------------------------------------
  getItem(slug: string): Promise<Item | null>;
  createItem(req: CreateItemRequest): Promise<Item>;
  patchItem(slug: string, req: PatchItemRequest): Promise<Item>;
  deleteItem(slug: string): Promise<void>;
}
