import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { EngineConfig } from './types.js';
import { Engine } from './engine.js';
import { SseHub } from './sse-hub.js';
import { mountConflictRoutes } from './http/conflict-routes.js';
import { mountWebhookRoutes } from './http/webhook-routes.js';

/**
 * Build and start a Fastify server wiring the Engine and SSE hub.
 *
 * Returns the Fastify instance (so callers can call `.close()` to stop).
 */
export async function createServer(config: EngineConfig) {
  const hub = new SseHub();
  const engine = new Engine(config, hub);

  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /** Liveness probe. */
  fastify.get('/health', async (_req, reply) => {
    return reply.code(200).send({ ok: true });
  });

  /** Current watcher + last-commit summary. */
  fastify.get('/status', async (_req, reply) => {
    return reply.code(200).send(engine.getStatus());
  });

  /**
   * SSE stream — emits `change`, `synced`, and `offline` events.
   * Clients should use `Last-Event-ID` for reconnection (replay not implemented
   * in M6; noted in README).
   */
  fastify.get('/events', (req, reply) => {
    hub.subscribe(req, reply);
  });

  // -------------------------------------------------------------------------
  // Conflict resolution routes (M8)
  // -------------------------------------------------------------------------

  mountConflictRoutes(fastify, {
    sessionManager: engine.conflictSessionManager,
    repoRoot: config.repoRoot,
    contentDir: config.contentDir,
    hub,
    getRemoteConfig: () => engine.getRemoteConfig(),
    commitAuthorName: config.commitAuthorName,
    commitAuthorEmail: config.commitAuthorEmail,
    testHooks: process.env['SYNC_ENGINE_TEST_HOOKS'] === '1',
  });

  // -------------------------------------------------------------------------
  // Webhook receiver — mounted only when GitHub App is configured with a secret
  // -------------------------------------------------------------------------

  const webhookSecret = config.githubApp?.webhookSecret ?? null;
  if (config.githubApp && webhookSecret) {
    mountWebhookRoutes(fastify, {
      engine,
      webhookSecret,
      targetBranch: config.targetBranch ?? 'main',
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  fastify.addHook('onClose', async () => {
    await engine.stop();
  });

  await engine.start();

  return fastify;
}

/**
 * Start the Fastify server listening on the configured port/host.
 * Registers SIGINT/SIGTERM handlers for graceful shutdown.
 */
export async function start(config: EngineConfig): Promise<void> {
  const server = await createServer(config);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await server.listen({ port: config.port, host: config.host });
}
