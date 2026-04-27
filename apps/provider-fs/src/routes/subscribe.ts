import type { FastifyPluginAsync } from 'fastify';
import { bus } from '../events/bus.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const SSE_RETRY_MS = 5_000;

/**
 * GET /subscribe — Server-Sent Events stream for local-write change events.
 *
 * Emits a `change` SSE event for every mutation performed by this sidecar.
 * External-change events (file watcher) are M6's responsibility.
 *
 * Sends a heartbeat comment every 15 s to keep proxies alive.
 * On client disconnect, cleans up subscription and timer.
 */
export const subscribeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/subscribe', async (req, reply) => {
    // Take full control of the raw response
    reply.hijack();

    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    raw.write(`retry: ${SSE_RETRY_MS}\n\n`);

    // Subscribe to bus events
    const unsubscribe = bus.subscribe((event) => {
      try {
        const data = JSON.stringify(event);
        raw.write(`event: change\ndata: ${data}\n\n`);
      } catch {
        // Client may have disconnected; ignore write errors
      }
    });

    // Heartbeat to keep long-polling proxies alive
    const heartbeat = setInterval(() => {
      try {
        raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Clean up on client disconnect
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      raw.end();
    });
  });
};
