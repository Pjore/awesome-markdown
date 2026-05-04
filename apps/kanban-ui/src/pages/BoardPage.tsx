import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Board } from '../board/Board.js';
import { useBoardRender } from '../state/useBoardRender.js';

/**
 * Board page — rendered at route `/boards/:slug`.
 * Loads the board's render envelope and renders the full kanban board.
 */
export function BoardPage(): React.ReactElement {
  const { slug = '' } = useParams<{ slug: string }>();
  const { status, render, homeless, refetch } = useBoardRender(slug);

  if (status === 'loading' || (status !== 'error' && render === null)) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading">
        <span className="text-gray-400 text-lg">Loading…</span>
      </div>
    );
  }

  if (status === 'error' || render === null) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-center p-8"
        data-testid="board-not-found"
      >
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">
          Board &quot;{slug}&quot; not found
        </h2>
        <p className="text-gray-500 mb-6 max-w-sm">
          No board with this slug exists in the current provider, or it failed to load.
        </p>
        <Link
          to="/"
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          data-testid="back-to-list"
        >
          ← All Boards
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="board-page">
      {/* Back-link breadcrumb */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Link
          to="/"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          data-testid="breadcrumb-boards"
        >
          ← All Boards
        </Link>
        <span className="text-sm text-gray-400">/</span>
        <span className="text-sm text-gray-600 font-medium">{render.board.title}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <Board render={render} homeless={homeless} onRefetch={refetch} />
      </div>
    </div>
  );
}
