import { useState, useEffect, useCallback, useRef } from 'react';
import type { Board, Column, Swimlane, Item } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';

export type BoardStateStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface BoardState {
  status: BoardStateStatus;
  board: Board | null;
  boardId: string | null;
  columns: Column[];
  swimlanes: Swimlane[];
  items: Item[];
}

/**
 * Loads the first board from the provider and subscribes to change events.
 * Re-fetches all board data whenever the provider fires a change.
 */
export function useBoardState(): BoardState {
  const provider = useProvider();
  const [state, setState] = useState<BoardState>({
    status: 'loading',
    board: null,
    boardId: null,
    columns: [],
    swimlanes: [],
    items: [],
  });

  // Use a ref to avoid stale closures in the subscription callback
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchAll = useCallback(async (): Promise<void> => {
    try {
      const boards = await provider.listBoards();
      if (boards.length === 0) {
        setState({
          status: 'empty',
          board: null,
          boardId: null,
          columns: [],
          swimlanes: [],
          items: [],
        });
        return;
      }

      const board = boards[0];
      if (!board) {
        setState({ status: 'empty', board: null, boardId: null, columns: [], swimlanes: [], items: [] });
        return;
      }

      const [columns, swimlanes, items] = await Promise.all([
        provider.listColumns(board.id),
        provider.listSwimlanes(board.id),
        provider.listItems(board.id),
      ]);

      setState({
        status: 'ready',
        board,
        boardId: board.id,
        columns: columns.slice().sort((a, b) => a.order - b.order),
        swimlanes: swimlanes.slice().sort((a, b) => a.order - b.order),
        items,
      });
    } catch (err) {
      console.error('Failed to load board state', err);
      setState((prev) => ({ ...prev, status: 'error' }));
    }
  }, [provider]);

  useEffect(() => {
    void fetchAll();

    const unsubscribe = provider.subscribe((_event) => {
      void fetchAll();
    });

    return () => {
      unsubscribe();
    };
  }, [provider, fetchAll]);

  return state;
}
