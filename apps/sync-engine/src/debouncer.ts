import { randomUUID } from 'node:crypto';
import type { RawFsEvent, Batch } from './types.js';

type FlushCallback = (batch: Batch) => void;

/**
 * Accumulates RawFsEvents and flushes a deduplicated Batch after a configurable
 * quiet window (debounceMs) of inactivity since the last event.
 *
 * Deduplication rules per path:
 * - If a file is added then deleted within the window: drop it entirely.
 * - If a file is modified multiple times: keep only the latest event.
 * - If a file is added then modified: keep as `add` (the first event type).
 */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, RawFsEvent>();
  private readonly firstEventType = new Map<string, 'add' | 'change' | 'unlink'>();
  private batchId: string = randomUUID();
  private batchStart = 0;

  constructor(
    private readonly debounceMs: number,
    private readonly onFlush: FlushCallback,
  ) {}

  /** Feed a raw filesystem event into the debouncer. */
  push(raw: RawFsEvent): void {
    if (this.pending.size === 0) {
      this.batchStart = Date.now();
      this.batchId = randomUUID();
    }

    const existing = this.pending.get(raw.path);
    const firstType = this.firstEventType.get(raw.path);

    if (!existing || !firstType) {
      // First event for this path in this batch window
      this.firstEventType.set(raw.path, raw.event);
      this.pending.set(raw.path, raw);
    } else if (firstType === 'add' && raw.event === 'unlink') {
      // Added then deleted within the window: ephemeral file, drop it
      this.pending.delete(raw.path);
      this.firstEventType.delete(raw.path);
    } else {
      // Update latest event but preserve the first event type
      this.pending.set(raw.path, raw);
    }

    this._reschedule();
  }

  /**
   * Flush any pending events immediately (e.g. during graceful shutdown).
   * No-op if there are no pending events.
   */
  flush(): void {
    if (this.pending.size === 0) return;
    this._doFlush();
  }

  /** Cancel a pending flush without emitting the batch. */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
    this.firstEventType.clear();
  }

  private _reschedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this._doFlush();
    }, this.debounceMs);
  }

  private _doFlush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;

    const events = new Map(this.pending);
    const paths = Array.from(events.keys());
    const batch: Batch = {
      batchId: this.batchId,
      paths,
      events,
      startTime: this.batchStart,
      flushTime: Date.now(),
    };

    this.pending.clear();
    this.firstEventType.clear();
    this.batchId = randomUUID();
    this.batchStart = 0;

    this.onFlush(batch);
  }
}
