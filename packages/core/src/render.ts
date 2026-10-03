import { resolveDimension } from '@awesome-markdown/contracts';
import type {
  Axis,
  AxisOrder,
  Board,
  BoardRender,
  Cell,
  FilterRule,
  Homeless,
  Item,
} from '@awesome-markdown/contracts';
import { analyzeInvertibility, evaluate, resolvePath } from '@awesome-markdown/filter-engine';
import type { Ctx } from '@awesome-markdown/filter-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Resolve an axis definition by slug. Return `undefined` when no definition
 * exists — the renderer substitutes a synthetic (filterless) axis.
 */
export type AxisLookup = (slug: string) => Axis | undefined;

export interface RenderBoardInput {
  board: Board;
  lookupAxis: AxisLookup;
  /** The full item pool; the board filter is applied here. */
  items: readonly Item[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fallback axis for a slug referenced by a board but missing a definition. */
export function syntheticAxis(slug: string): Axis {
  return { entityType: 'axis', slug, title: slug, synthetic: true };
}

/** Compare two scalar order values; non-comparable pairs are equal (0). */
export function compareScalars(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return 0;
}

/**
 * Sort a cell's items by the axis order (when both values resolve), falling
 * back to `updatedAt` descending. Returns a new array.
 */
export function sortItems(items: readonly Item[], axisOrder: AxisOrder | undefined, ctx: Ctx): Item[] {
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

/**
 * A cell is read-only when either axis is explicitly `readonly`, or when the
 * combined filter (board ∧ column ∧ swimlane) is non-invertible. Dimensions
 * with an explicit `writeOnDrop` array don't require filter invertibility.
 */
export function isCellReadOnly(
  boardFilter: FilterRule | undefined,
  col: Axis,
  lane: Axis,
): boolean {
  if (!Array.isArray(col.writeOnDrop) && col.writeOnDrop?.readonly) return true;
  if (!Array.isArray(lane.writeOnDrop) && lane.writeOnDrop?.readonly) return true;
  const filters: FilterRule[] = [];
  if (boardFilter) filters.push(boardFilter);
  if (!Array.isArray(col.writeOnDrop) && col.filter) filters.push(col.filter);
  if (!Array.isArray(lane.writeOnDrop) && lane.filter) filters.push(lane.filter);
  if (filters.length === 0) return false;
  const combined: FilterRule = filters.length === 1 ? filters[0]! : { all: filters };
  return !analyzeInvertibility(combined).invertible;
}

function withSynthetic(lookupAxis: AxisLookup): (slug: string) => Axis {
  return slug => lookupAxis(slug) ?? syntheticAxis(slug);
}

// ---------------------------------------------------------------------------
// Render / homeless
// ---------------------------------------------------------------------------

/**
 * Project the item pool through a board: the full (column × swimlane)
 * Cartesian product of cells, each with its matching, sorted items.
 * Wire shape of `GET /boards/:slug/render`.
 */
export function renderBoard({ board, lookupAxis, items }: RenderBoardInput): BoardRender {
  const ctx: Ctx = { board: board.slug };
  const lookup = withSynthetic(lookupAxis);
  const colAxes = resolveDimension(board.columns, lookup);
  const laneAxes = resolveDimension(board.swimlanes, lookup);

  const candidates = items.filter(item => !board.filter || evaluate(board.filter, item, ctx));

  const cells: Cell[] = [];
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
}

/**
 * Items that list this board in `boards[]` and pass the board filter but
 * match no column. Wire shape of `GET /boards/:slug/homeless`.
 */
export function computeHomeless({ board, lookupAxis, items }: RenderBoardInput): Homeless {
  const ctx: Ctx = { board: board.slug };
  const colAxes = resolveDimension(board.columns, withSynthetic(lookupAxis));

  const candidates = items.filter(item =>
    item.boards?.some(e => e['board'] === board.slug) &&
    (!board.filter || evaluate(board.filter, item, ctx)),
  );

  const homeless = candidates.filter(item =>
    !colAxes.some(col => !col.filter || evaluate(col.filter, item, ctx)),
  );

  return { board, items: homeless };
}
