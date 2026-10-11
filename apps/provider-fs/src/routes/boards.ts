import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import {
  BoardSchema,
  BoardRenderSchema,
  HomelessSchema,
  CreateBoardRequestSchema,
  PatchBoardRequestSchema,
  DeleteResponseSchema,
  mergePatch,
} from '@awesome-markdown/contracts';
import type { Board } from '@awesome-markdown/contracts';
import { renderBoard, computeHomeless } from '@awesome-markdown/core';
import { serializeEntity } from '@awesome-markdown/core/markdown';
import type { IndexStore } from '../fs/index-store.js';
import { writeFileAtomic } from '../fs/atomic-write.js';
import { bus } from '../events/bus.js';
import { RepoError } from '../errors.js';

interface BoardsPluginOptions extends FastifyPluginOptions {
  store: IndexStore;
  contentRoot: string;
}

function firstDuplicate(slugs: string[]): string | undefined {
  const seen = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s)) return s;
    seen.add(s);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const boardParams = z.object({ slug: z.string() });

export const boardsRoutes: FastifyPluginAsyncZod<BoardsPluginOptions> = async (
  fastify,
  opts,
) => {
  const { store, contentRoot } = opts;

  // GET /boards
  fastify.get(
    '/boards',
    { schema: { response: { 200: z.array(BoardSchema) } } },
    async () => store.listBoards(),
  );

  // POST /boards
  fastify.post(
    '/boards',
    { schema: { body: CreateBoardRequestSchema.strict(), response: { 201: BoardSchema } } },
    async (req, reply) => {
      const { slug, title, description, filter, columns, swimlanes } = req.body;

      if (store.getBoard(slug)) {
        throw new RepoError('already_exists', `Board ${slug} already exists`);
      }

      const dupCol = columns ? firstDuplicate(columns) : undefined;
      if (dupCol) {
        throw new RepoError('validation_failed', `Duplicate column axis slug: ${dupCol}`);
      }
      const dupLane = swimlanes ? firstDuplicate(swimlanes) : undefined;
      if (dupLane) {
        throw new RepoError('validation_failed', `Duplicate swimlane axis slug: ${dupLane}`);
      }

      const now = new Date().toISOString();
      const board: Board = {
        entityType: 'board',
        slug,
        title,
        ...(description !== undefined ? { description } : {}),
        ...(filter !== undefined ? { filter } : {}),
        ...(columns !== undefined ? { columns } : {}),
        ...(swimlanes !== undefined ? { swimlanes } : {}),
        createdAt: now,
        updatedAt: now,
      };

      const filePath = path.join(contentRoot, `${slug}.md`);
      await writeFileAtomic(filePath, serializeEntity(board));
      store.upsertBoard(slug, board, filePath);
      bus.publish({ type: 'change', path: `${slug}.md`, entityId: slug });

      return reply.status(201).send(board);
    },
  );

  // PATCH /boards/:slug
  fastify.patch(
    '/boards/:slug',
    { schema: { params: boardParams, body: PatchBoardRequestSchema.strict(), response: { 200: BoardSchema } } },
    async (req) => {
      const { slug } = req.params;
      const existing = store.getBoard(slug);
      if (!existing) throw new RepoError('not_found', `Board ${slug} not found`);
      const filePath = store.getBoardFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Board ${slug} not found`);

      const { columns, swimlanes } = req.body;
      const dupCol = columns ? firstDuplicate(columns) : undefined;
      if (dupCol) {
        throw new RepoError('validation_failed', `Duplicate column axis slug: ${dupCol}`);
      }
      const dupLane = swimlanes ? firstDuplicate(swimlanes) : undefined;
      if (dupLane) {
        throw new RepoError('validation_failed', `Duplicate swimlane axis slug: ${dupLane}`);
      }

      const updated: Board = {
        ...mergePatch(existing, req.body),
        updatedAt: new Date().toISOString(),
      };

      await writeFileAtomic(filePath, serializeEntity(updated));
      store.upsertBoard(slug, updated, filePath);
      bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });

      return updated;
    },
  );

  // DELETE /boards/:slug
  fastify.delete(
    '/boards/:slug',
    { schema: { params: boardParams, response: { 200: DeleteResponseSchema } } },
    async (req) => {
      const { slug } = req.params;
      const filePath = store.getBoardFilePath(slug);
      if (!filePath) throw new RepoError('not_found', `Board ${slug} not found`);

      await unlink(filePath);
      store.removeByFilePath(filePath);
      bus.publish({ type: 'change', path: path.relative(contentRoot, filePath), entityId: slug });

      return { ok: true as const };
    },
  );

  // GET /boards/:slug/render
  fastify.get(
    '/boards/:slug/render',
    { schema: { params: boardParams, response: { 200: BoardRenderSchema } } },
    async (req) => {
      const board = store.getBoard(req.params.slug);
      if (!board) throw new RepoError('not_found', `Board ${req.params.slug} not found`);

      return renderBoard({ board, lookupAxis: s => store.getAxis(s), items: store.listItems() });
    },
  );

  // GET /boards/:slug/homeless
  fastify.get(
    '/boards/:slug/homeless',
    { schema: { params: boardParams, response: { 200: HomelessSchema } } },
    async (req) => {
      const board = store.getBoard(req.params.slug);
      if (!board) throw new RepoError('not_found', `Board ${req.params.slug} not found`);

      return computeHomeless({ board, lookupAxis: s => store.getAxis(s), items: store.listItems() });
    },
  );
};
