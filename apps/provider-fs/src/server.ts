import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { mkdir } from 'node:fs/promises';
import type { Config } from './config.js';
import { installErrorHandler } from './plugins/error-envelope.js';
import { BoardsRepo } from './fs/boards-repo.js';
import { ColumnsRepo } from './fs/columns-repo.js';
import { SwimlanesRepo } from './fs/swimlanes-repo.js';
import { ItemsRepo } from './fs/items-repo.js';
import { boardsRoutes } from './routes/boards.js';
import { columnsRoutes } from './routes/columns.js';
import { swimlanesRoutes } from './routes/swimlanes.js';
import { itemsRoutes } from './routes/items.js';
import { healthRoute } from './routes/health.js';
import { subscribeRoute } from './routes/subscribe.js';

/**
 * Build and configure a Fastify server instance.
 * Does NOT start listening — callers must call `server.listen(...)`.
 * Export allows tests to create isolated server instances.
 */
export async function createServer(config: Config) {
  // Ensure content root directory exists
  await mkdir(config.contentRoot, { recursive: true });

  const fastify = Fastify({
    logger: false,
  });

  // Wire up Zod type provider
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Install error handler on the root instance so it applies to all scopes
  installErrorHandler(fastify);

  // Instantiate repositories
  const boardsRepo = new BoardsRepo(config.contentRoot);
  const columnsRepo = new ColumnsRepo(config.contentRoot);
  const swimlanesRepo = new SwimlanesRepo(config.contentRoot);
  const itemsRepo = new ItemsRepo(config.contentRoot);

  // Register routes
  await fastify.register(healthRoute, { contentRoot: config.contentRoot });
  await fastify.register(subscribeRoute);
  await fastify.register(boardsRoutes, { boardsRepo });
  await fastify.register(columnsRoutes, { columnsRepo });
  await fastify.register(swimlanesRoutes, { swimlanesRepo });
  await fastify.register(itemsRoutes, { itemsRepo });

  return fastify;
}
