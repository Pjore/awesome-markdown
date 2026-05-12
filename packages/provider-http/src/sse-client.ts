import { SyncEventSchema } from '@awesome-markdown/contracts';
import type { SyncEvent } from '@awesome-markdown/contracts';
import type { ConnectionState, ConnectionStateHandler } from './connection-state.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncEventHandler = (event: SyncEvent) => void;

export type EventSourceCtor = new (url: string) => EventSource;

export interface SseClientConfig {
  url: string;
  EventSourceCtor?: EventSourceCtor;
  getToken?: () => Promise<string>;
}

// ---------------------------------------------------------------------------
// Backoff constants
// ---------------------------------------------------------------------------

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;
const JITTER_FACTOR = 0.25;

// ---------------------------------------------------------------------------
// SseClient
// ---------------------------------------------------------------------------

/**
 * Manages a Server-Sent Events connection to the sidecar with
 * exponential backoff + jitter reconnect on failure.
 *
 * - start()  — open the EventSource (idempotent while running)
 * - idle()   — close the EventSource, return to idle (reversible)
 * - stop()   — permanent teardown; clears all handlers
 */
export class SseClient {
  private es: EventSource | null = null;
  private state: ConnectionState = 'idle';
  private stopped = false;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly stateHandlers = new Set<ConnectionStateHandler>();
  private readonly eventHandlers = new Set<SyncEventHandler>();
  private readonly EsCtor: EventSourceCtor;
  private readonly url: string;
  private readonly getToken: (() => Promise<string>) | undefined;

  constructor(config: SseClientConfig) {
    this.url = config.url;
    this.EsCtor = config.EventSourceCtor ?? EventSource;
    this.getToken = config.getToken;
  }

  // -- Public API ------------------------------------------------------------

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(handler: ConnectionStateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  onEvent(handler: SyncEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Open the EventSource. No-op if already connecting/online/reconnecting
   * or if permanently stopped.
   */
  start(): void {
    if (this.stopped) return;
    if (
      this.state === 'connecting' ||
      this.state === 'online' ||
      this.state === 'reconnecting'
    ) {
      return;
    }
    void this.connect();
  }

  /**
   * Close the EventSource and reset to idle state.
   * Can be restarted with start().
   */
  idle(): void {
    if (this.stopped) return;
    this.clearReconnectTimer();
    this.closeEs();
    this.retryCount = 0;
    this.setState('idle');
  }

  /**
   * Permanent teardown. Clears all handlers. Cannot be restarted.
   */
  stop(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    this.closeEs();
    this.setState('offline');
    this.stateHandlers.clear();
    this.eventHandlers.clear();
  }

  // -- Private ---------------------------------------------------------------

  private async connect(): Promise<void> {
    this.setState('connecting');
    let sseUrl = this.url;
    if (this.getToken) {
      const token = await this.getToken();
      sseUrl = `${sseUrl}?token=${token}`;
    }
    const es = new this.EsCtor(sseUrl);
    this.es = es;

    es.addEventListener('open', () => {
      this.retryCount = 0;
      this.setState('online');
    });

    // The M4 sidecar emits named 'change' events
    es.addEventListener('change', (e: Event) => {
      const msgEvent = e as MessageEvent<string>;
      this.handleMessage(msgEvent.data);
    });

    es.addEventListener('error', () => {
      this.closeEs();
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const raw: unknown = JSON.parse(data);
      const event = SyncEventSchema.parse(raw);
      for (const handler of this.eventHandlers) {
        handler(event);
      }
    } catch {
      // Drop and warn on invalid payload (must not log body per policy)
      console.warn('[SseClient] Dropped invalid SSE payload');
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setState('reconnecting');
    const delay = this.calculateDelay();
    this.retryCount += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) void this.connect();
    }, delay);
  }

  private calculateDelay(): number {
    const base = Math.min(BASE_DELAY_MS * Math.pow(2, this.retryCount), MAX_DELAY_MS);
    const jitter = base * JITTER_FACTOR * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(base + jitter));
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeEs(): void {
    if (this.es !== null) {
      this.es.close();
      this.es = null;
    }
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const handler of this.stateHandlers) {
      handler(next);
    }
  }
}
