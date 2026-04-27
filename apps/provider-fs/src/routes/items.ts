import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ItemsListResponseSchema,
  ItemResponseSchema,
  CreateItemRequestSchema,
  UpdateItemRequestSchema,
  DeleteResponseSchema,
} from '@awesome-markdown/contracts';
import type { ItemsRepo } from '../fs/items-repo.js';
import { bus } from '../events/bus.js';

interface ItemsPluginOptions extends FastifyPluginOptions {
  itemsRepo: ItemsRepo;
}

const boardParams = z.object({ boardId: z.string() });
const itemParams = z.object({ boardId: z.string(), itemId: z.string() });

export const itemsRoutes: FastifyPluginAsyncZod<ItemsPluginOptions> = async (
  fastify,
  opts,
) => {
  const { itemsRepo } = opts;

  // List items for a board
  fastify.get(
    '/boards/:boardId/items',
    {
      schema: {
        params: boardParams,
        response: { 200: ItemsListResponseSchema },
      },
    },
    async (req) => {
      const items = await itemsRepo.list(req.params.boardId);
      return { items };
    },
  );

  // Get a single item
  fastify.get(
    '/boards/:boardId/items/:itemId',
    {
      schema: {
        params: itemParams,
        response: { 200: ItemResponseSchema },
      },
    },
    async (req) => {
      return itemsRepo.get(req.params.boardId, req.params.itemId);
    },
  );

  // Create an item
  fastify.post(
    '/boards/:boardId/items',
    {
      schema: {
        params: boardParams,
        body: CreateItemRequestSchema.strict(),
        response: { 201: ItemResponseSchema },
      },
    },
    async (req, reply) => {
      // Override boardId from path to prevent mismatches
      const item = await itemsRepo.create({
        ...req.body,
        boardId: req.params.boardId,
      });
      bus.publish({
        type: 'change',
        path: `boards/${item.boardId}/items/${item.id}.md`,
        entityId: item.id,
      });
      return reply.status(201).send(item);
    },
  );

  // Update an item
  fastify.put(
    '/boards/:boardId/items/:itemId',
    {
      schema: {
        params: itemParams,
        body: UpdateItemRequestSchema.strict(),
        response: { 200: ItemResponseSchema },
      },
    },
    async (req) => {
      const item = await itemsRepo.update(
        req.params.boardId,
        req.params.itemId,
        req.body,
      );
      bus.publish({
        type: 'change',
        path: `boards/${item.boardId}/items/${item.id}.md`,
        entityId: item.id,
      });
      return item;
    },
  );

  // Delete an item
  fastify.delete(
    '/boards/:boardId/items/:itemId',
    {
      schema: {
        params: itemParams,
        response: { 200: DeleteResponseSchema },
      },
    },
    async (req) => {
      const { boardId, itemId } = req.params;
      await itemsRepo.delete(boardId, itemId);
      bus.publish({
        type: 'change',
        path: `boards/${boardId}/items/${itemId}.md`,
        entityId: itemId,
      });
      return { ok: true as const };
    },
  );
};
