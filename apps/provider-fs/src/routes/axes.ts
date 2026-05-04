import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AxisSchema } from '@awesome-markdown/contracts';
import type { IndexStore } from '../fs/index-store.js';

interface AxesPluginOptions extends FastifyPluginOptions {
  store: IndexStore;
}

/** GET /axes — list all non-synthetic (file-backed) axes. */
export const axesRoutes: FastifyPluginAsyncZod<AxesPluginOptions> = async (
  fastify,
  opts,
) => {
  const { store } = opts;

  fastify.get(
    '/axes',
    { schema: { response: { 200: z.array(AxisSchema) } } },
    async () => store.listAxes(),
  );
};
