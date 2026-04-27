import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Board } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';

/**
 * Board list page — rendered at route `/`.
 * Lists all boards from the current provider; each links to `/boards/:slug`.
 */
export function BoardListPage(): React.ReactElement {
  const provider = useProvider();
  const [boards, setBoards] = useState<Board[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const result = await provider.listBoards();
        if (!cancelled) {
          setBoards(result);
          setStatus('ready');
        }
      } catch (err) {
        console.error('Failed to list boards', err);
        if (!cancelled) setStatus('error');
      }
    };

    void load();

    const unsubscribe = provider.subscribe((_event) => {
      void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [provider]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full" data-testid="board-list-loading">
        <span className="text-gray-400 text-lg">Loading boards…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="flex items-center justify-center h-full text-red-500"
        data-testid="board-list-error"
      >
        Failed to load boards. Please refresh.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto" data-testid="board-list">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Boards</h2>

      {boards.length === 0 ? (
        <div className="text-center py-16" data-testid="board-list-empty">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-500">No boards yet. Create one via settings.</p>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="board-list-items">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                to={`/boards/${board.slug}`}
                data-testid={`board-link-${board.slug}`}
                className="flex flex-col gap-1 p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 transition-all group"
              >
                <span
                  className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors"
                  data-testid={`board-title-${board.slug}`}
                >
                  {board.title}
                </span>
                {board.description && (
                  <span className="text-sm text-gray-500">{board.description}</span>
                )}
                <span className="text-xs text-gray-400 font-mono mt-1">/boards/{board.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
