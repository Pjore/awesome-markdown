import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  BoardSchema,
  BoardRenderSchema,
  HomelessSchema,
} from '@awesome-markdown/contracts';
import type { Item, Axis, FilterRule, AxisOrder } from '@awesome-markdown/contracts';
import {
  evaluate,
  analyzeInvertibility,
  resolvePath,
} from '@awesome-markdown/filter-engine';
import type { Ctx } from '@awesome-markdown/filter-engine';
import type { IndexStore } from '../fs/index-store.js';
import { RepoError } from '../errors.js';

interface BoardsPluginOptions extends FastifyPluginOptions {
  store: IndexStore;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function syntheticAxis(slug: string): Axis {
  return { entityType: 'axis', slug, title: slug, synthetic: true };
}

function compareScalars(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return 0;
}

function sortItems(items: Item[], axisOrder: AxisOrder | undefined, ctx: Ctx): Item[] {
  return [...items].sort((a, b) => {
    if (axisOrder) {
      const va = resolvePath(axisOrder.by, a, ctx);
      const vb = resolvePath(axisOrder.by, b, ctx);
      if (va !== undefined && vb !== undefined) {
        const cmp = compareScalars(va, vb);
        if (cmp !== 0) return axisOrder.direction === 'asc' ? cmp : -cmp;
      }
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function isCellReadOnly(
  boardFilter: FilterRule | undefined,
  col: Axis,
  lane: Axis,
): boolean {
  if (!Array.isArray(col.writeOnDrop) && col.writeOnDrop?.readonly) return true;
  if (!Array.isArray(lane.writeOnDrop) && lane.writeOnDrop?.readonly) return true;
  // Dimensions with explicit writeOnDrop arrays don't require filter invertibility.
  // Only include filters for dimensions that still rely on inversion.
  const filters: FilterRule[] = [];
  if (boardFilter) filters.push(boardFilter);
  if (!Array.isArray(col.writeOnDrop) && col.filter) filters.push(col.filter);
  if (!Array.isArray(lane.writeOnDrop) && lane.filter) filters.push(lane.filter);
  if (filters.length === 0) return false;
  const combined: FilterRule = filters.length === 1 ? filters[0]! : { all: filters };
  return !analyzeInvertibility(combined).invertible;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const boardParams = z.object({ slug: z.string() });

export const boardsRoutes: FastifyPluginAsyncZod<BoardsPluginOptions> = async (
  fastify,
  opts,
) => {
  const { store } = opts;

  // GET /boards
  fastify.get(
    '/boards',
    { schema: { response: { 200: z.array(BoardSchema) } } },
    async () => store.listBoards(),
  );

  // GET /boards/:slug/render
  fastify.get(
    '/boards/:slug/render',
    { schema: { params: boardParams, response: { 200: BoardRenderSchema } } },
    async (req) => {
      const board = store.getBoard(req.params.slug);
      if (!board) throw new RepoError('not_found', `Board ${req.params.slug} not found`);

      const ctx: Ctx = { board: board.slug };
      const colAxes = (board.columns ?? []).map(s => store.getAxis(s) ?? syntheticAxis(s));
      const laneAxes = (board.swimlanes ?? []).map(s => store.getAxis(s) ?? syntheticAxis(s));

      const candidates = store.listItems().filter(item =>
        !board.filter || evaluate(board.filter, item, ctx),
      );

      const cells = [];
      for (const col of colAxes) {
        for (const lane of laneAxes) {
          const cellItems = candidates.filter(item =>
            (!col.filter || evaluate(col.filter, item, ctx)) &&
            (!lane.filter || evaluate(lane.filter, item, ctx)),
          );
          cells.push({
            columnSlug: col.slug,
            swimlaneSlug: lane.slug,
            readOnly: isCellReadOnly(board.filter, col, lane),
            items: sortItems(cellItems, col.order, ctx),
          });
        }
      }

      return { board, axes: { columns: colAxes, swimlanes: laneAxes }, cells };
    },
  );

  // GET /boards/:slug/homeless
  fastify.get(
    '/boards/:slug/homeless',
    { schema: { params: boardParams, response: { 200: HomelessSchema } } },
    async (req) => {
      const board = store.getBoard(req.params.slug);
      if (!board) throw new RepoError('not_found', `Board ${req.params.slug} not found`);

      const ctx: Ctx = { board: board.slug };
      const colAxes = (board.columns ?? []).map(s => store.getAxis(s) ?? syntheticAxis(s));

      const candidates = store.listItems().filter(item =>
        item.boards?.some(e => e['board'] === board.slug) &&
        (!board.filter || evaluate(board.filter, item, ctx)),
      );

      const homeless = candidates.filter(item =>
        !colAxes.some(col => !col.filter || evaluate(col.filter, item, ctx)),
      );

      return { board, items: homeless };
    },
  );
};
