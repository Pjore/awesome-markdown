import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  BoardsListResponseSchema,
  BoardResponseSchema,
  CreateBoardRequestSchema,
  UpdateBoardRequestSchema,
  DeleteResponseSchema,
} from '@awesome-markdown/contracts';
import type { BoardsRepo } from '../fs/boards-repo.js';
import { bus } from '../events/bus.js';
import { RepoError } from '../errors.js';

interface BoardsPluginOptions extends FastifyPluginOptions {
  boardsRepo: BoardsRepo;
}

export const boardsRoutes: FastifyPluginAsyncZod<BoardsPluginOptions> = async (
  fastify,
  opts,
) => {
  const { boardsRepo } = opts;

  // List all boards
  fastify.get(
    '/boards',
    { schema: { response: { 200: BoardsListResponseSchema } } },
    async () => {
      const boards = await boardsRepo.list();
      return { boards };
    },
  );

  // Get a single board
  fastify.get(
    '/boards/:boardId',
    {
      schema: {
        params: z.object({ boardId: z.string() }),
        response: { 200: BoardResponseSchema },
      },
    },
    async (req) => {
      return boardsRepo.get(req.params.boardId);
    },
  );

  // Create a board
  fastify.post(
    '/boards',
    {
      schema: {
        body: CreateBoardRequestSchema.strict(),
        response: { 201: BoardResponseSchema },
      },
    },
    async (req, reply) => {
      const board = await boardsRepo.create(req.body);
      bus.publish({
        type: 'change',
        path: `boards/${board.id}/board.yaml`,
        entityId: board.id,
      });
      return reply.status(201).send(board);
    },
  );

  // Update a board
  fastify.put(
    '/boards/:boardId',
    {
      schema: {
        params: z.object({ boardId: z.string() }),
        body: UpdateBoardRequestSchema.strict(),
        response: { 200: BoardResponseSchema },
      },
    },
    async (req) => {
      const board = await boardsRepo.update(req.params.boardId, req.body);
      bus.publish({
        type: 'change',
        path: `boards/${board.id}/board.yaml`,
        entityId: board.id,
      });
      return board;
    },
  );

  // Delete a board
  fastify.delete(
    '/boards/:boardId',
    {
      schema: {
        params: z.object({ boardId: z.string() }),
        response: { 200: DeleteResponseSchema },
      },
    },
    async (req) => {
      const { boardId } = req.params;
      await boardsRepo.delete(boardId);
      bus.publish({
        type: 'change',
        path: `boards/${boardId}/board.yaml`,
        entityId: boardId,
      });
      return { ok: true as const };
    },
  );
};

export { RepoError };
