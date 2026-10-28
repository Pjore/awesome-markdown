import path from 'node:path';
import { unlink, access } from 'node:fs/promises';
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ItemSchema,
  ItemRecordSchema,
  CreateItemRequestSchema,
  PatchItemRequestSchema,
  DeleteResponseSchema,
  SlugSchema,
} from '@awesome-markdown/contracts';
import type { Item } from '@awesome-markdown/contracts';
import { applyMutations } from '@awesome-markdown/core';
import { serializeEntity } from '@awesome-markdown/core/markdown';
import type { IndexStore } from '../fs/index-store.js';
import { writeFileAtomic } from '../fs/atomic-write.js';
import { readItemRecord, revisionOf, itemLock } from '../fs/item-record.js';
import { bus } from '../events/bus.js';
import { RepoError, isENOENT } from '../errors.js';

interface ItemsPluginOptions extends FastifyPluginOptions {
  store: IndexStore;
  contentRoot: string;
}
const itemParams = z.object({ slug: SlugSchema });

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (isENOENT(error)) return false;
    throw error;
  }
}

export const itemsRoutes: FastifyPluginAsyncZod<ItemsPluginOptions> = async (
  fastify,
  { store, contentRoot }
) => {
  fastify.get(
    '/items/:slug',
    {
      schema: { params: itemParams, response: { 200: ItemRecordSchema } },
    },
    async (req) => {
      const filePath = store.getItemFilePath(req.params.slug);
      if (!filePath) throw new RepoError('not_found', `Item ${req.params.slug} not found`);
      return readItemRecord(filePath, req.params.slug);
    }
  );

  fastify.post(
    '/items',
    {
      schema: { body: CreateItemRequestSchema.strict(), response: { 201: ItemRecordSchema } },
    },
    async (req, reply) =>
      itemLock(contentRoot, async () => {
        const { slug, title, mutations, body } = req.body;
        let finalSlug = slug;
        let suffix = 2;
        while (
          store.getItem(finalSlug) ||
          (await exists(path.join(contentRoot, `${finalSlug}.md`)))
        )
          finalSlug = `${slug}-${suffix++}`;
        const now = new Date().toISOString();
        const base: Item = {
          entityType: 'item',
          slug: finalSlug,
          title,
          body: body ?? '',
          createdAt: now,
          updatedAt: now,
        };
        let item: Item;
        try {
          item = ItemSchema.parse(mutations.length ? applyMutations(base, mutations, now) : base);
        } catch (error) {
          throw new RepoError(
            'validation_failed',
            error instanceof Error ? error.message : 'Invalid item'
          );
        }
        const filePath = path.join(contentRoot, `${finalSlug}.md`);
        const source = serializeEntity(item);
        await writeFileAtomic(filePath, source);
        store.upsertItem(finalSlug, item, filePath);
        bus.publish({ type: 'change', path: `${finalSlug}.md`, entityId: finalSlug });
        return reply.status(201).send({ item, revision: revisionOf(source) });
      })
  );

  fastify.patch(
    '/items/:slug',
    {
      schema: {
        params: itemParams,
        body: PatchItemRequestSchema.strict(),
        response: { 200: ItemRecordSchema },
      },
    },
    async (req) => {
      const { slug } = req.params;
      const filePath = store.getItemFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Item ${slug} not found`);
      return itemLock(filePath, async () => {
        const existing = await readItemRecord(filePath, slug);
        if (existing.revision !== req.body.revision)
          throw new RepoError(
            'conflict',
            'Item changed on disk. Export the draft or reload after discarding changes.'
          );
        let item: Item;
        try {
          item = applyMutations(existing.item, req.body.mutations);
        } catch (error) {
          throw new RepoError(
            'validation_failed',
            error instanceof Error ? error.message : 'Invalid mutations'
          );
        }
        const source = serializeEntity(item);
        await writeFileAtomic(filePath, source);
        store.upsertItem(slug, item, filePath);
        bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });
        return { item, revision: revisionOf(source) };
      });
    }
  );

  fastify.delete(
    '/items/:slug',
    {
      schema: { params: itemParams, response: { 200: DeleteResponseSchema } },
    },
    async (req) => {
      const { slug } = req.params;
      const filePath = store.getItemFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Item ${slug} not found`);
      return itemLock(filePath, async () => {
        try {
          await unlink(filePath);
        } catch (error) {
          if (isENOENT(error)) throw new RepoError('not_found', `Item ${slug} was deleted`);
          throw error;
        }
        store.removeByFilePath(filePath);
        bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });
        return { ok: true as const };
      });
    }
  );
};
