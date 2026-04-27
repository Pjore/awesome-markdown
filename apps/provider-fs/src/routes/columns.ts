import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ColumnsListResponseSchema,
  ColumnResponseSchema,
  CreateColumnRequestSchema,
  UpdateColumnRequestSchema,
  DeleteResponseSchema,
} from '@awesome-markdown/contracts';
import type { ColumnsRepo } from '../fs/columns-repo.js';
import { bus } from '../events/bus.js';

interface ColumnsPluginOptions extends FastifyPluginOptions {
  columnsRepo: ColumnsRepo;
}

const boardParams = z.object({ boardId: z.string() });
const columnParams = z.object({ boardId: z.string(), columnId: z.string() });

export const columnsRoutes: FastifyPluginAsyncZod<ColumnsPluginOptions> = async (
  fastify,
  opts,
) => {
  const { columnsRepo } = opts;

  // List columns for a board
  fastify.get(
    '/boards/:boardId/columns',
    {
      schema: {
        params: boardParams,
        response: { 200: ColumnsListResponseSchema },
      },
    },
    async (req) => {
      const columns = await columnsRepo.list(req.params.boardId);
      return { columns };
    },
  );

  // Get a single column
  fastify.get(
    '/boards/:boardId/columns/:columnId',
    {
      schema: {
        params: columnParams,
        response: { 200: ColumnResponseSchema },
      },
    },
    async (req) => {
      return columnsRepo.get(req.params.boardId, req.params.columnId);
    },
  );

  // Create a column
  fastify.post(
    '/boards/:boardId/columns',
    {
      schema: {
        params: boardParams,
        body: CreateColumnRequestSchema.strict(),
        response: { 201: ColumnResponseSchema },
      },
    },
    async (req, reply) => {
      const column = await columnsRepo.create({
        ...req.body,
        boardId: req.params.boardId,
      });
      bus.publish({
        type: 'change',
        path: `boards/${column.boardId}/columns.yaml`,
        entityId: column.id,
      });
      return reply.status(201).send(column);
    },
  );

  // Update a column
  fastify.put(
    '/boards/:boardId/columns/:columnId',
    {
      schema: {
        params: columnParams,
        body: UpdateColumnRequestSchema.strict(),
        response: { 200: ColumnResponseSchema },
      },
    },
    async (req) => {
      const column = await columnsRepo.update(
        req.params.boardId,
        req.params.columnId,
        req.body,
      );
      bus.publish({
        type: 'change',
        path: `boards/${column.boardId}/columns.yaml`,
        entityId: column.id,
      });
      return column;
    },
  );

  // Delete a column
  fastify.delete(
    '/boards/:boardId/columns/:columnId',
    {
      schema: {
        params: columnParams,
        response: { 200: DeleteResponseSchema },
      },
    },
    async (req) => {
      const { boardId, columnId } = req.params;
      await columnsRepo.delete(boardId, columnId);
      bus.publish({
        type: 'change',
        path: `boards/${boardId}/columns.yaml`,
        entityId: columnId,
      });
      return { ok: true as const };
    },
  );
};
