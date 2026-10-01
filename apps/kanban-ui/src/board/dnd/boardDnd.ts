import { closestCenter } from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core';
import type { BoardRender, Cell, Homeless, Item, Mutation } from '@awesome-markdown/contracts';
import { deriveMutations } from '@awesome-markdown/filter-engine';
import { buildCellFilter } from './mutateDragDrop.js';
import { decodeCellId } from './dragTypes.js';
import type { HomelessItemDragData } from './dragTypes.js';

/**
 * Items only collide with cells/items; axis headers only with headers of the
 * same dimension — so reordering columns never targets a cell and vice versa.
 */
export const layoutAwareCollision: CollisionDetection = (args) => {
  const active = args.active.data.current as { type?: string; dim?: string } | undefined;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const data = c.data.current as { type?: string; dim?: string } | undefined;
    if (active?.type === 'axis') return data?.type === 'axis' && data.dim === active.dim;
    return data?.type !== 'axis';
  });
  return closestCenter({ ...args, droppableContainers });
};

export interface HomelessDropPlan {
  itemSlug: string;
  mutations: Mutation[];
  newCells: Cell[];
}

/** Resolve a homeless-item drop into its PATCH mutations and optimistic cells. */
export function planHomelessDrop(
  event: DragEndEvent,
  cells: Cell[],
  render: BoardRender,
  homeless: Homeless
): HomelessDropPlan | null {
  if (!event.over) return null;
  const { itemSlug } = event.active.data.current as HomelessItemDragData;
  const overId = String(event.over.id);

  let dstColumnSlug: string;
  let dstSwimlaneSlug: string;
  let insertBeforeSlug: string | null;

  const cellDecoded = decodeCellId(overId);
  if (cellDecoded) {
    dstColumnSlug = cellDecoded.columnSlug;
    dstSwimlaneSlug = cellDecoded.swimlaneSlug;
    insertBeforeSlug = null;
  } else {
    const overCell = cells.find((c) => c.items.some((i) => i.slug === overId));
    if (!overCell) return null;
    dstColumnSlug = overCell.columnSlug;
    dstSwimlaneSlug = overCell.swimlaneSlug;
    insertBeforeSlug = overId;
  }

  const dstCell = cells.find(
    (c) => c.columnSlug === dstColumnSlug && c.swimlaneSlug === dstSwimlaneSlug
  );
  if (!dstCell || dstCell.readOnly) return null;

  const colAxis = render.axes.columns.find((a) => a.slug === dstColumnSlug);
  const slAxis = render.axes.swimlanes.find((a) => a.slug === dstSwimlaneSlug);
  if (!colAxis || !slAxis) return null;

  const filter = buildCellFilter(render.board, colAxis, slAxis);
  const mutations = deriveMutations(
    filter,
    { board: render.board.slug },
    colAxis.writeOnDrop ?? slAxis.writeOnDrop
  );
  if (!Array.isArray(mutations)) return null;

  const movingItem: Item | undefined = homeless.items.find((i) => i.slug === itemSlug);
  if (!movingItem) return null;

  const newCells = cells.map((cell) => {
    if (cell.columnSlug !== dstColumnSlug || cell.swimlaneSlug !== dstSwimlaneSlug) return cell;
    const withoutItem = cell.items.filter((i) => i.slug !== itemSlug);
    const idx =
      insertBeforeSlug === null ? -1 : withoutItem.findIndex((i) => i.slug === insertBeforeSlug);
    const insertAt = idx >= 0 ? idx : withoutItem.length;
    return {
      ...cell,
      items: [...withoutItem.slice(0, insertAt), movingItem, ...withoutItem.slice(insertAt)],
    };
  });

  return { itemSlug, mutations, newCells };
}
