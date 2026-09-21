import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import path from 'node:path';
import matter from 'gray-matter';
import { AxisSchema, CreateAxisRequestSchema } from '@awesome-markdown/contracts';
import type { Axis } from '@awesome-markdown/contracts';
import type { IndexStore } from '../fs/index-store.js';
import { writeFileAtomic } from '../fs/atomic-write.js';
import { bus } from '../events/bus.js';
import { RepoError } from '../errors.js';

interface AxesPluginOptions extends FastifyPluginOptions {
  store: IndexStore;
  contentRoot: string;
}

function serializeAxis(axis: Axis): string {
  return matter.stringify('', axis);
}

/** GET /axes — list all non-synthetic (file-backed) axes. */
export const axesRoutes: FastifyPluginAsyncZod<AxesPluginOptions> = async (
  fastify,
  opts,
) => {
  const { store, contentRoot } = opts;

  fastify.get(
    '/axes',
    { schema: { response: { 200: z.array(AxisSchema) } } },
    async () => store.listAxes(),
  );

  // POST /axes
  fastify.post(
    '/axes',
    { schema: { body: CreateAxisRequestSchema.strict(), response: { 201: AxisSchema } } },
    async (req, reply) => {
      const { slug, title, description, filter } = req.body;

      if (store.getAxis(slug)) {
        throw new RepoError('already_exists', `Axis ${slug} already exists`);
      }

      const now = new Date().toISOString();
      const axis: Axis = {
        entityType: 'axis',
        slug,
        title,
        ...(description !== undefined ? { description } : {}),
        ...(filter !== undefined ? { filter } : {}),
        createdAt: now,
        updatedAt: now,
      };

      const filePath = path.join(contentRoot, `${slug}.md`);
      await writeFileAtomic(filePath, serializeAxis(axis));
      store.upsertAxis(slug, axis, filePath);
      bus.publish({ type: 'change', path: `${slug}.md`, entityId: slug });

      return reply.status(201).send(axis);
    },
  );
};

