import type { FastifyReply } from 'fastify';
import type { SyncEvent } from '@awesome-markdown/contracts';

const HEARTBEAT_INTERVAL_MS = 15_000;
const SSE_RETRY_MS = 3_000;

/**
 * Manages a set of active SSE connections.
 * Each call to `subscribe(reply)` registers a new subscriber.
 * `broadcast(event)` serializes the event and writes it to all active connections.
 */
export class SseHub {
  private readonly subscribers = new Set<FastifyReply['raw']>();

  /**
   * Register an incoming Fastify reply as an SSE subscriber.
   * Sets SSE headers, sends the initial retry directive and a heartbeat comment,
   * registers a periodic heartbeat, and auto-removes on client close.
   */
  subscribe(req: { raw: import('node:http').IncomingMessage }, reply: FastifyReply): void {
    reply.hijack();

    const raw = reply.raw;
    const origin = (req.raw.headers as Record<string, string | undefined>)['origin'] ?? '*';
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });
    raw.write(`retry: ${SSE_RETRY_MS}\n\n`);
    raw.write(': connected\n\n');

    this.subscribers.add(raw);

    const heartbeat = setInterval(() => {
      try {
        raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        this.subscribers.delete(raw);
      }
    }, HEARTBEAT_INTERVAL_MS);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      this.subscribers.delete(raw);
      try {
        raw.end();
      } catch {
        // Already closed — ignore
      }
    });
  }

  /**
   * Broadcast a SyncEvent to all active subscribers.
   * The `event:` line is set to the event's `type` discriminator.
   */
  broadcast(event: SyncEvent): void {
    if (this.subscribers.size === 0) return;
    const data = JSON.stringify(event);
    const frame = `event: ${event.type}\ndata: ${data}\n\n`;
    for (const raw of this.subscribers) {
      try {
        raw.write(frame);
      } catch {
        // Client disconnected mid-write; clean up on next heartbeat
        this.subscribers.delete(raw);
      }
    }
  }

  /** Number of currently connected SSE clients. */
  get size(): number {
    return this.subscribers.size;
  }

  /** Close all active SSE connections (for graceful shutdown). */
  closeAll(): void {
    for (const raw of this.subscribers) {
      try {
        raw.end();
      } catch {
        // Already closed
      }
    }
    this.subscribers.clear();
  }
}
