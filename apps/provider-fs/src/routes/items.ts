import path from 'node:path';
import { unlink } from 'node:fs/promises';
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ItemSchema,
  CreateItemRequestSchema,
  PatchItemRequestSchema,
  DeleteResponseSchema,
  SlugSchema,
} from '@awesome-markdown/contracts';
import type { Item } from '@awesome-markdown/contracts';
import matter from 'gray-matter';
import type { IndexStore } from '../fs/index-store.js';
import { applyMutations } from '../fs/apply-mutations.js';
import { writeFileAtomic } from '../fs/atomic-write.js';
import { bus } from '../events/bus.js';
import { RepoError } from '../errors.js';

interface ItemsPluginOptions extends FastifyPluginOptions {
  store: IndexStore;
  contentRoot: string;
}

function serializeItem(item: Item): string {
  const { body, ...frontmatter } = item;
  return matter.stringify(body ?? '', frontmatter);
}

const itemParams = z.object({ slug: SlugSchema });

export const itemsRoutes: FastifyPluginAsyncZod<ItemsPluginOptions> = async (
  fastify,
  opts,
) => {
  const { store, contentRoot } = opts;

  // GET /items/:slug
  fastify.get(
    '/items/:slug',
    { schema: { params: itemParams, response: { 200: ItemSchema } } },
    async (req) => {
      const item = store.getItem(req.params.slug);
      if (!item) throw new RepoError('not_found', `Item ${req.params.slug} not found`);
      return item;
    },
  );

  // POST /items
  fastify.post(
    '/items',
    { schema: { body: CreateItemRequestSchema.strict(), response: { 201: ItemSchema } } },
    async (req, reply) => {
      const { slug: requestedSlug, title, mutations, body } = req.body;

      // Collision handling: append -2, -3, ... until unique
      let finalSlug = requestedSlug;
      let suffix = 2;
      while (store.getItem(finalSlug)) {
        finalSlug = `${requestedSlug}-${suffix}`;
        suffix++;
      }

      const now = new Date().toISOString();
      const baseItem: Item = {
        entityType: 'item',
        slug: finalSlug,
        title,
        body,
        createdAt: now,
        updatedAt: now,
      };

      const item = mutations.length > 0 ? applyMutations(baseItem, mutations, now) : baseItem;
      // applyMutations may overwrite updatedAt — restore timestamps
      const finalItem: Item = { ...item, createdAt: now, updatedAt: now };

      const filePath = path.join(contentRoot, `${finalSlug}.md`);
      await writeFileAtomic(filePath, serializeItem(finalItem));
      store.upsertItem(finalSlug, finalItem, filePath);
      bus.publish({ type: 'change', path: `${finalSlug}.md`, entityId: finalSlug });

      return reply.status(201).send(finalItem);
    },
  );

  // PATCH /items/:slug
  fastify.patch(
    '/items/:slug',
    { schema: { params: itemParams, body: PatchItemRequestSchema.strict(), response: { 200: ItemSchema } } },
    async (req) => {
      const { slug } = req.params;
      const existing = store.getItem(slug);
      if (!existing) throw new RepoError('not_found', `Item ${slug} not found`);
      const filePath = store.getItemFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Item ${slug} not found`);

      const updated = applyMutations(existing, req.body.mutations);
      await writeFileAtomic(filePath, serializeItem(updated));
      store.upsertItem(slug, updated, filePath);
      bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });

      return updated;
    },
  );

  // DELETE /items/:slug
  fastify.delete(
    '/items/:slug',
    { schema: { params: itemParams, response: { 200: DeleteResponseSchema } } },
    async (req) => {
      const { slug } = req.params;
      const filePath = store.getItemFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Item ${slug} not found`);

      await unlink(filePath);
      store.removeByFilePath(filePath);
      bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });

      return { ok: true as const };
    },
  );
};
