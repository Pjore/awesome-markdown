import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { parseSafeYaml } from '@awesome-markdown/contracts';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { mkdir } from 'node:fs/promises';
import type { Config } from './config.js';
import { installErrorHandler } from './plugins/error-envelope.js';
import { IndexStore } from './fs/index-store.js';
import { scanDirectory } from './fs/scanner.js';
import { boardsRoutes } from './routes/boards.js';
import { axesRoutes } from './routes/axes.js';
import { itemsRoutes } from './routes/items.js';
import { healthRoute } from './routes/health.js';
import { subscribeRoute } from './routes/subscribe.js';

export { IndexStore };

/**
 * Build and configure a Fastify server instance.
 *
 * When `externalStore` is provided (production / integration tests that need
 * shared store access), it is used directly. Otherwise a fresh store is
 * created and populated from a scan of `config.contentRoot`.
 *
 * Does NOT start the file watcher — callers start it separately so the
 * same store instance is shared. Does NOT start listening.
 */
export async function createServer(config: Config, externalStore?: IndexStore) {
  await mkdir(config.contentRoot, { recursive: true });

  let store: IndexStore;
  if (externalStore) {
    store = externalStore;
  } else {
    store = new IndexStore();
    const entities = await scanDirectory(config.contentRoot);
    store.loadFrom(entities);
  }

  const fastify = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, source, done) => {
      try {
        JSON.parse(source as string); // Require JSON syntax, not the broader YAML grammar.
        done(null, parseSafeYaml(source as string, 'transport'));
      } catch (error) {
        done(
          Object.assign(new Error(error instanceof Error ? error.message : 'Invalid JSON'), {
            statusCode: 400,
          })
        );
      }
    }
  );

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  installErrorHandler(fastify);

  const packageVersion = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    }
  ).version;
  await fastify.register(healthRoute, { contentRoot: config.contentRoot, version: packageVersion });
  await fastify.register(subscribeRoute);
  await fastify.register(boardsRoutes, { store, contentRoot: config.contentRoot });
  await fastify.register(axesRoutes, { store, contentRoot: config.contentRoot });
  await fastify.register(itemsRoutes, { store, contentRoot: config.contentRoot });

  return fastify;
}
