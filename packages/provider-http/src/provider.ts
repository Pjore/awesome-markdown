import type {
  PersistenceProvider,
  ProviderCapabilities,
  ProviderEventHandler,
  Unsubscribe,
  Board,
  Axis,
  BoardRender,
  Homeless,
  Item,
  CreateItemRequest,
  PatchItemRequest,
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
  getToken?: () => Promise<string>;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createHttpProvider(config: HttpProviderConfig): HttpPersistenceProvider {
  const base = config.baseUrl.replace(/\/$/, '');
  const client = new SidecarHttpClient({ baseUrl: base, fetchFn: config.fetchFn, getToken: config.getToken });
  const sse = new SseClient({
    url: endpoints.subscribe(base),
    EventSourceCtor: config.EventSourceCtor,
    getToken: config.getToken,
  });

  const subscribers = new Set<ProviderEventHandler>();
  let sseEventUnsub: (() => void) | null = null;

  function startSse(): void {
    if (sseEventUnsub !== null) return;
    sse.start();
    sseEventUnsub = sse.onEvent((event) => {
      for (const handler of subscribers) {
        if (event.type === 'change') {
          handler({
            type: 'change',
            entitySlug: event.entityId ?? event.path.replace(/\.md$/, ''),
            entityType: 'item',
          });
        } else if (event.type === 'synced') {
          handler({ type: 'synced' });
        } else if (event.type === 'offline') {
          handler({ type: 'offline', reason: event.reason });
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

    async listBoards(): Promise<Board[]> {
      return client.listBoards();
    },

    async getBoard(slug: string): Promise<Board | null> {
      return client.getBoard(slug);
    },

    // -- Axes ----------------------------------------------------------------

    async listAxes(): Promise<Axis[]> {
      return client.listAxes();
    },

    async getAxis(slug: string): Promise<Axis | null> {
      return client.getAxis(slug);
    },

    // -- Render / Homeless ---------------------------------------------------

    async getBoardRender(slug: string): Promise<BoardRender> {
      return client.getBoardRender(slug);
    },

    async getHomeless(boardSlug: string): Promise<Homeless> {
      return client.getHomeless(boardSlug);
    },

    // -- Items ---------------------------------------------------------------

    async getItem(slug: string): Promise<Item | null> {
      return client.getItem(slug);
    },

    async createItem(req: CreateItemRequest): Promise<Item> {
      return client.createItem(req);
    },

    async patchItem(slug: string, req: PatchItemRequest): Promise<Item> {
      return client.patchItem(slug, req);
    },

    async deleteItem(slug: string): Promise<void> {
      return client.deleteItem(slug);
    },
  };

  return provider;
}
