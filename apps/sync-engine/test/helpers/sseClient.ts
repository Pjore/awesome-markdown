import type { SyncEvent } from '@awesome-markdown/contracts';

export type ParsedSseFrame = {
  event: string;
  data: SyncEvent;
};

/**
 * Minimal SSE client built on Node's `fetch` streaming API.
 * Parses `event:` / `data:` frames from an SSE endpoint and exposes them
 * via an async iterator.
 */
export class SseClient {
  private readonly frames: ParsedSseFrame[] = [];
  private readonly listeners: Array<(frame: ParsedSseFrame) => void> = [];
  private abortController = new AbortController();
  private done = false;
  private connectPromise: Promise<void>;

  constructor(private readonly url: string) {
    this.connectPromise = this._connect();
  }

  /** Wait until the SSE connection is established (first chunk received). */
  async waitForConnection(timeoutMs = 3000): Promise<void> {
    await Promise.race([
      this.connectPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('SSE connection timeout')), timeoutMs),
      ),
    ]).catch(() => {
      // Connection might not have emitted yet — that's OK if we got headers
    });
    // Short pause to allow the connection to settle
    await new Promise((r) => setTimeout(r, 50));
  }

  /**
   * Wait for the next frame matching a predicate, up to `timeoutMs`.
   * Checks already-buffered frames first.
   */
  waitFor(
    predicate: (frame: ParsedSseFrame) => boolean,
    timeoutMs = 8000,
  ): Promise<ParsedSseFrame> {
    // Check existing frames first
    const existing = this.frames.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise<ParsedSseFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.listeners.indexOf(handler);
        if (idx !== -1) this.listeners.splice(idx, 1);
        reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (frame: ParsedSseFrame) => {
        if (predicate(frame)) {
          clearTimeout(timer);
          const idx = this.listeners.indexOf(handler);
          if (idx !== -1) this.listeners.splice(idx, 1);
          resolve(frame);
        }
      };
      this.listeners.push(handler);
    });
  }

  /** All frames received so far. */
  get received(): readonly ParsedSseFrame[] {
    return this.frames;
  }

  /** Close the SSE connection. */
  close(): void {
    this.abortController.abort();
    this.done = true;
  }

  private async _connect(): Promise<void> {
    try {
      const response = await fetch(this.url, {
        signal: this.abortController.signal,
      });
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (!this.done) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        this._parseBuffer(buffer);
        // Keep only the unparsed tail
        const lastDouble = buffer.lastIndexOf('\n\n');
        if (lastDouble !== -1) {
          buffer = buffer.slice(lastDouble + 2);
        }
      }
    } catch {
      // AbortError or connection close — expected during cleanup
    }
  }

  private _parseBuffer(raw: string): void {
    // Split into double-newline delimited blocks
    const blocks = raw.split('\n\n');
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed || trimmed.startsWith(':')) continue; // comment / heartbeat

      let event = 'message';
      let dataStr = '';

      for (const line of trimmed.split('\n')) {
        if (line.startsWith('event: ')) {
          event = line.slice('event: '.length).trim();
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice('data: '.length).trim();
        }
      }

      if (!dataStr) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      const frame: ParsedSseFrame = { event, data: parsed as SyncEvent };
      this.frames.push(frame);
      for (const listener of this.listeners) {
        listener(frame);
      }
    }
  }
}
