import { useCallback, useEffect, useMemo, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type {
  Axis,
  Board,
  BoardRender,
  PatchAxisRequest,
  PatchBoardRequest,
} from '@awesome-markdown/contracts';
import { useProvider } from '../../provider/ProviderContext.js';
import { useProviderSubscribe } from '../../state/useProviderSubscribe.js';
import {
  MANUAL_ORDER,
  declaredSlugs,
  defaultAxisFilter,
  slugify,
  uniqueSlug,
} from './axis-defaults.js';
import type { AxisDim } from './axis-defaults.js';

export interface AxisUsage {
  board: string;
  dim: AxisDim;
}

export interface BoardLayout {
  /** Axes in display order, with any in-flight reorder applied. */
  columns: Axis[];
  swimlanes: Axis[];
  /** True when the board declares no axes for the dimension (implicit axis shown). */
  implicit: Record<AxisDim, boolean>;
  /** Each action resolves `false` after reporting a failure through `onError`. */
  addAxis: (dim: AxisDim, title: string) => Promise<boolean>;
  moveAxis: (dim: AxisDim, activeSlug: string, overSlug: string) => Promise<boolean>;
  removeAxis: (dim: AxisDim, slug: string) => Promise<boolean>;
  saveAxis: (slug: string, patch: PatchAxisRequest) => Promise<boolean>;
  saveBoard: (patch: PatchBoardRequest) => Promise<boolean>;
  /** Other boards that reference the axis — edits to it change them too. */
  usage: (slug: string) => AxisUsage[];
}

/**
 * Layout editing for a rendered board. Every action is one immediate write
 * (plus a createAxis when adding), then a refetch.
 */
export function useBoardLayout(
  render: BoardRender,
  onRefetch: () => void,
  onError: (msg: string) => void
): BoardLayout {
  const provider = useProvider();
  const board = render.board;
  const [pending, setPending] = useState<Partial<Record<AxisDim, string[]>>>({});
  const [boards, setBoards] = useState<Board[]>([]);

  const loadBoards = useCallback(() => {
    provider.listBoards().then(setBoards, () => setBoards([]));
  }, [provider]);
  useEffect(loadBoards, [loadBoards]);
  useProviderSubscribe(loadBoards);
  useEffect(() => setPending({}), [render]);

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>): Promise<boolean> => {
      try {
        await action();
        return true;
      } catch (err) {
        setPending({});
        onError(`Failed to ${label}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return false;
      } finally {
        onRefetch();
      }
    },
    [onRefetch, onError]
  );

  const ordered = (dim: AxisDim): Axis[] => {
    const axes = render.axes[dim];
    const order = pending[dim];
    if (!order) return axes;
    return order
      .map((slug) => axes.find((a) => a.slug === slug))
      .filter((a): a is Axis => a !== undefined);
  };

  const addAxis = useCallback(
    (dim: AxisDim, title: string) =>
      run('add axis', async () => {
        const taken = new Set((await provider.listAxes()).map((a) => a.slug));
        const slug = uniqueSlug(slugify(title, dim === 'columns' ? 'column' : 'row'), taken);
        await provider.createAxis({
          slug,
          title,
          filter: defaultAxisFilter(dim, slug),
          order: MANUAL_ORDER,
        });
        await provider.patchBoard(board.slug, { [dim]: [...declaredSlugs(board, dim), slug] });
      }),
    [run, provider, board]
  );

  const moveAxis = useCallback(
    (dim: AxisDim, activeSlug: string, overSlug: string) => {
      const list = declaredSlugs(board, dim);
      const from = list.indexOf(activeSlug);
      const to = list.indexOf(overSlug);
      if (from < 0 || to < 0 || from === to) return Promise.resolve(true);
      const next = arrayMove(list, from, to);
      setPending((p) => ({ ...p, [dim]: next }));
      return run('reorder', () => provider.patchBoard(board.slug, { [dim]: next }));
    },
    [run, provider, board]
  );

  const removeAxis = useCallback(
    (dim: AxisDim, slug: string) =>
      run('remove axis', () =>
        provider.patchBoard(board.slug, {
          [dim]: declaredSlugs(board, dim).filter((s) => s !== slug),
        })
      ),
    [run, provider, board]
  );

  const saveAxis = useCallback(
    (slug: string, patch: PatchAxisRequest) =>
      run('save axis', () => provider.patchAxis(slug, patch)),
    [run, provider]
  );

  const saveBoard = useCallback(
    (patch: PatchBoardRequest) => run('save board', () => provider.patchBoard(board.slug, patch)),
    [run, provider, board.slug]
  );

  const usage = useMemo(() => {
    const others = boards.filter((b) => b.slug !== board.slug);
    return (slug: string): AxisUsage[] =>
      others.flatMap((b) => [
        ...(b.columns?.includes(slug) ? [{ board: b.slug, dim: 'columns' as const }] : []),
        ...(b.swimlanes?.includes(slug) ? [{ board: b.slug, dim: 'swimlanes' as const }] : []),
      ]);
  }, [boards, board.slug]);

  return {
    columns: ordered('columns'),
    swimlanes: ordered('swimlanes'),
    implicit: {
      columns: declaredSlugs(board, 'columns').length === 0,
      swimlanes: declaredSlugs(board, 'swimlanes').length === 0,
    },
    addAxis,
    moveAxis,
    removeAxis,
    saveAxis,
    saveBoard,
    usage,
  };
}
