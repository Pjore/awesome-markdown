import type { SyncEvent } from '@awesome-markdown/contracts';

type EventHandler = (event: SyncEvent) => void;

/**
 * In-process synchronous pub/sub bus for local-write SSE events.
 * External-change events (from file watcher) are M6's responsibility.
 */
class EventBus {
  private readonly handlers = new Set<EventHandler>();

  /** Dispatch an event to all current subscribers. */
  publish(event: SyncEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  /**
   * Subscribe to events.
   * @returns an unsubscribe function — call it to stop receiving events.
   */
  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

/** Singleton bus instance shared across the server process. */
export const bus = new EventBus();
export type { EventHandler };
