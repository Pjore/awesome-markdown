import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SwimlanesListResponseSchema,
  SwimlaneResponseSchema,
  CreateSwimlaneRequestSchema,
  UpdateSwimlaneRequestSchema,
  DeleteResponseSchema,
} from '@awesome-markdown/contracts';
import type { SwimlanesRepo } from '../fs/swimlanes-repo.js';
import { bus } from '../events/bus.js';

interface SwimlanesPluginOptions extends FastifyPluginOptions {
  swimlanesRepo: SwimlanesRepo;
}

const boardParams = z.object({ boardId: z.string() });
const swimlaneParams = z.object({ boardId: z.string(), swimlaneId: z.string() });

export const swimlanesRoutes: FastifyPluginAsyncZod<SwimlanesPluginOptions> = async (
  fastify,
  opts,
) => {
  const { swimlanesRepo } = opts;

  // List swimlanes for a board
  fastify.get(
    '/boards/:boardId/swimlanes',
    {
      schema: {
        params: boardParams,
        response: { 200: SwimlanesListResponseSchema },
      },
    },
    async (req) => {
      const swimlanes = await swimlanesRepo.list(req.params.boardId);
      return { swimlanes };
    },
  );

  // Get a single swimlane
  fastify.get(
    '/boards/:boardId/swimlanes/:swimlaneId',
    {
      schema: {
        params: swimlaneParams,
        response: { 200: SwimlaneResponseSchema },
      },
    },
    async (req) => {
      return swimlanesRepo.get(req.params.boardId, req.params.swimlaneId);
    },
  );

  // Create a swimlane
  fastify.post(
    '/boards/:boardId/swimlanes',
    {
      schema: {
        params: boardParams,
        body: CreateSwimlaneRequestSchema.strict(),
        response: { 201: SwimlaneResponseSchema },
      },
    },
    async (req, reply) => {
      const swimlane = await swimlanesRepo.create({
        ...req.body,
        boardId: req.params.boardId,
      });
      bus.publish({
        type: 'change',
        path: `boards/${swimlane.boardId}/swimlanes.yaml`,
        entityId: swimlane.id,
      });
      return reply.status(201).send(swimlane);
    },
  );

  // Update a swimlane
  fastify.put(
    '/boards/:boardId/swimlanes/:swimlaneId',
    {
      schema: {
        params: swimlaneParams,
        body: UpdateSwimlaneRequestSchema.strict(),
        response: { 200: SwimlaneResponseSchema },
      },
    },
    async (req) => {
      const swimlane = await swimlanesRepo.update(
        req.params.boardId,
        req.params.swimlaneId,
        req.body,
      );
      bus.publish({
        type: 'change',
        path: `boards/${swimlane.boardId}/swimlanes.yaml`,
        entityId: swimlane.id,
      });
      return swimlane;
    },
  );

  // Delete a swimlane
  fastify.delete(
    '/boards/:boardId/swimlanes/:swimlaneId',
    {
      schema: {
        params: swimlaneParams,
        response: { 200: DeleteResponseSchema },
      },
    },
    async (req) => {
      const { boardId, swimlaneId } = req.params;
      await swimlanesRepo.delete(boardId, swimlaneId);
      bus.publish({
        type: 'change',
        path: `boards/${boardId}/swimlanes.yaml`,
        entityId: swimlaneId,
      });
      return { ok: true as const };
    },
  );
};
