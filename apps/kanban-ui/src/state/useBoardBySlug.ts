import { useState, useEffect, useCallback, useRef } from 'react';
import type { Board } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import type { BoardState } from './useBoardState.js';

/**
 * Loads a board by its slug, then fetches columns/swimlanes/items for it.
 * Subscribes to provider change events and re-fetches on each event.
 */
export function useBoardBySlug(slug: string): BoardState {
  const provider = useProvider();
  const [state, setState] = useState<BoardState>({
    status: 'loading',
    board: null,
    boardId: null,
    columns: [],
    swimlanes: [],
    items: [],
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchAll = useCallback(async (): Promise<void> => {
    try {
      const boards = await provider.listBoards();
      const board: Board | undefined = boards.find((b) => b.slug === slug);
      if (!board) {
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
      console.error('Failed to load board by slug', slug, err);
      setState((prev) => ({ ...prev, status: 'error' }));
    }
  }, [provider, slug]);

  useEffect(() => {
    // Reset to loading when slug changes
    setState({
      status: 'loading',
      board: null,
      boardId: null,
      columns: [],
      swimlanes: [],
      items: [],
    });
    void fetchAll();

    const unsubscribe = provider.subscribe((_event) => {
      void fetchAll();
    });

    // Also re-fetch when the sync-engine reports a remote pull change
    const handleRemoteChange = (): void => { void fetchAll(); };
    window.addEventListener('sync-engine:change', handleRemoteChange);

    return () => {
      unsubscribe();
      window.removeEventListener('sync-engine:change', handleRemoteChange);
    };
  }, [provider, slug, fetchAll]);

  return state;
}
