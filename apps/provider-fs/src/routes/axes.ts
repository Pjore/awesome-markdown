import { unlink } from 'node:fs/promises';
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import path from 'node:path';
import matter from 'gray-matter';
import {
  AxisSchema,
  CreateAxisRequestSchema,
  PatchAxisRequestSchema,
  DeleteResponseSchema,
  SlugSchema,
} from '@awesome-markdown/contracts';
import type { Axis } from '@awesome-markdown/contracts';
import type { IndexStore } from '../fs/index-store.js';
import { writeFileAtomic } from '../fs/atomic-write.js';
import { bus } from '../events/bus.js';
import { RepoError } from '../errors.js';

const axisParams = z.object({ slug: SlugSchema });

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

  // PATCH /axes/:slug
  fastify.patch(
    '/axes/:slug',
    { schema: { params: axisParams, body: PatchAxisRequestSchema.strict(), response: { 200: AxisSchema } } },
    async (req) => {
      const { slug } = req.params;
      const existing = store.getAxis(slug);
      if (!existing) throw new RepoError('not_found', `Axis ${slug} not found`);
      const filePath = store.getAxisFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Axis ${slug} not found`);

      const updated: Axis = {
        ...existing,
        ...req.body,
        updatedAt: new Date().toISOString(),
      };

      await writeFileAtomic(filePath, serializeAxis(updated));
      store.upsertAxis(slug, updated, filePath);
      bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });

      return updated;
    },
  );

  // DELETE /axes/:slug
  fastify.delete(
    '/axes/:slug',
    { schema: { params: axisParams, response: { 200: DeleteResponseSchema } } },
    async (req) => {
      const { slug } = req.params;
      const filePath = store.getAxisFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Axis ${slug} not found`);

      await unlink(filePath);
      store.removeByFilePath(filePath);
      bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });

      return { ok: true as const };
    },
  );
};

