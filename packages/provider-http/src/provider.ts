import type {
  PersistenceProvider,
  ProviderCapabilities,
  ProviderEventHandler,
  Unsubscribe,
  Board,
  Item,
  Column,
  Swimlane,
  CreateBoardInput,
  UpdateBoardInput,
  CreateItemInput,
  UpdateItemInput,
  CreateColumnInput,
  UpdateColumnInput,
  CreateSwimlaneInput,
  UpdateSwimlaneInput,
} from '@awesome-markdown/contracts';
import type { ConnectionState, ConnectionStateHandler } from './connection-state.js';
import { SidecarHttpClient } from './http-client.js';
import type { FetchFn } from './http-client.js';
import { SseClient } from './sse-client.js';
import type { EventSourceCtor } from './sse-client.js';
import { endpoints } from './endpoints.js';

// ---------------------------------------------------------------------------
// Extended provider interface (HTTP-specific surface)
// ---------------------------------------------------------------------------

/**
 * HttpPersistenceProvider extends PersistenceProvider with:
 * - getConnectionState() — current SSE connection state
 * - onConnectionStateChange() — subscribe to state changes
 * - stop() — permanent teardown (tears down SSE)
 */
export interface HttpPersistenceProvider extends PersistenceProvider {
  getConnectionState(): ConnectionState;
  onConnectionStateChange(handler: ConnectionStateHandler): Unsubscribe;
  stop(): void;
}

/**
 * Type guard — true when the provider is an HttpPersistenceProvider.
 * Use this in the UI to feature-detect connection-state methods.
 */
export function isHttpProvider(p: PersistenceProvider): p is HttpPersistenceProvider {
  return p.capabilities.type === 'http';
}

// ---------------------------------------------------------------------------
// Factory config
// ---------------------------------------------------------------------------

export interface HttpProviderConfig {
  baseUrl: string;
  fetchFn?: FetchFn;
  EventSourceCtor?: EventSourceCtor;
}

// ---------------------------------------------------------------------------
// boardId cache helpers
// ---------------------------------------------------------------------------

/**
 * The M4 sidecar uses nested routes (/boards/:boardId/items/:itemId).
 * The provider contract only passes entity ids for get/update/delete.
 * This cache maps entity-id → boardId to reconstruct the URL.
 * It is populated by list* and create* calls.
 */
function makeBoardIdCache() {
  const cache = new Map<string, string>(); // entityId -> boardId

  function put(entityId: string, boardId: string): void {
    cache.set(entityId, boardId);
  }

  function require(entityId: string, entityKind: string): string {
    const bid = cache.get(entityId);
    if (bid === undefined) {
      throw new Error(
        `[provider-http] boardId not found for ${entityKind} "${entityId}". ` +
          `Ensure list${entityKind}s(boardId) was called before this operation.`,
      );
    }
    return bid;
  }

  return { put, require };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createHttpProvider(config: HttpProviderConfig): HttpPersistenceProvider {
  const base = config.baseUrl.replace(/\/$/, '');
  const client = new SidecarHttpClient({ baseUrl: base, fetchFn: config.fetchFn });
  const sse = new SseClient({
    url: endpoints.subscribe(base),
    EventSourceCtor: config.EventSourceCtor,
  });

  const itemCache = makeBoardIdCache();
  const colCache = makeBoardIdCache();
  const slCache = makeBoardIdCache();

  const subscribers = new Set<ProviderEventHandler>();
  let sseEventUnsub: (() => void) | null = null;

  function startSse(): void {
    if (sseEventUnsub !== null) return;
    sse.start();
    sseEventUnsub = sse.onEvent((event) => {
      for (const handler of subscribers) {
        if (event.type === 'change') {
          handler({ type: 'change', entityId: event.entityId ?? '', entityType: 'unknown' });
        } else if (event.type === 'synced') {
          handler({ type: 'synced' });
        } else if (event.type === 'offline') {
          handler({ type: 'offline' });
        }
      }
    });
  }

  function stopSseIfIdle(): void {
    if (subscribers.size === 0 && sseEventUnsub !== null) {
      sseEventUnsub();
      sseEventUnsub = null;
      sse.idle();
    }
  }

  const capabilities: ProviderCapabilities = { type: 'http', baseUrl: base };

  const provider: HttpPersistenceProvider = {
    capabilities,

    // -- Connection state (HTTP extension) -----------------------------------

    getConnectionState() {
      return sse.getState();
    },

    onConnectionStateChange(handler: ConnectionStateHandler): Unsubscribe {
      return sse.onStateChange(handler);
    },

    stop() {
      sseEventUnsub?.();
      sseEventUnsub = null;
      sse.stop();
    },

    // -- Subscriptions -------------------------------------------------------

    subscribe(handler: ProviderEventHandler): Unsubscribe {
      subscribers.add(handler);
      startSse();
      return () => {
        subscribers.delete(handler);
        stopSseIfIdle();
      };
    },

    // -- Boards --------------------------------------------------------------

    async getBoard(id: string): Promise<Board | null> {
      return client.getBoard(id);
    },

    async listBoards(): Promise<Board[]> {
      return client.listBoards();
    },

    async createBoard(data: CreateBoardInput): Promise<Board> {
      return client.createBoard(data);
    },

    async updateBoard(id: string, data: UpdateBoardInput): Promise<Board> {
      return client.updateBoard(id, data);
    },

    async deleteBoard(id: string): Promise<void> {
      return client.deleteBoard(id);
    },

    // -- Items ---------------------------------------------------------------

    async getItem(id: string): Promise<Item | null> {
      const boardId = itemCache.require(id, 'Item');
      return client.getItem(boardId, id);
    },

    async listItems(boardId: string): Promise<Item[]> {
      const items = await client.listItems(boardId);
      for (const item of items) itemCache.put(item.id, item.boardId);
      return items;
    },

    async createItem(data: CreateItemInput): Promise<Item> {
      const item = await client.createItem(data);
      itemCache.put(item.id, item.boardId);
      return item;
    },

    async updateItem(id: string, data: UpdateItemInput): Promise<Item> {
      const boardId = itemCache.require(id, 'Item');
      const item = await client.updateItem(boardId, id, data);
      itemCache.put(item.id, item.boardId);
      return item;
    },

    async deleteItem(id: string): Promise<void> {
      const boardId = itemCache.require(id, 'Item');
      return client.deleteItem(boardId, id);
    },

    // -- Columns -------------------------------------------------------------

    async getColumn(id: string): Promise<Column | null> {
      const boardId = colCache.require(id, 'Column');
      return client.getColumn(boardId, id);
    },

    async listColumns(boardId: string): Promise<Column[]> {
      const cols = await client.listColumns(boardId);
      for (const col of cols) colCache.put(col.id, col.boardId);
      return cols;
    },

    async createColumn(data: CreateColumnInput): Promise<Column> {
      const col = await client.createColumn(data);
      colCache.put(col.id, col.boardId);
      return col;
    },

    async updateColumn(id: string, data: UpdateColumnInput): Promise<Column> {
      const boardId = colCache.require(id, 'Column');
      const col = await client.updateColumn(boardId, id, data);
      colCache.put(col.id, col.boardId);
      return col;
    },

    async deleteColumn(id: string): Promise<void> {
      const boardId = colCache.require(id, 'Column');
      return client.deleteColumn(boardId, id);
    },

    // -- Swimlanes -----------------------------------------------------------

    async getSwimlane(id: string): Promise<Swimlane | null> {
      const boardId = slCache.require(id, 'Swimlane');
      return client.getSwimlane(boardId, id);
    },

    async listSwimlanes(boardId: string): Promise<Swimlane[]> {
      const sls = await client.listSwimlanes(boardId);
      for (const sl of sls) slCache.put(sl.id, sl.boardId);
      return sls;
    },

    async createSwimlane(data: CreateSwimlaneInput): Promise<Swimlane> {
      const sl = await client.createSwimlane(data);
      slCache.put(sl.id, sl.boardId);
      return sl;
    },

    async updateSwimlane(id: string, data: UpdateSwimlaneInput): Promise<Swimlane> {
      const boardId = slCache.require(id, 'Swimlane');
      const sl = await client.updateSwimlane(boardId, id, data);
      slCache.put(sl.id, sl.boardId);
      return sl;
    },

    async deleteSwimlane(id: string): Promise<void> {
      const boardId = slCache.require(id, 'Swimlane');
      return client.deleteSwimlane(boardId, id);
    },
  };

  return provider;
}
