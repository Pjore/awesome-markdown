import React, { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Board } from '../board/Board.js';
import { useBoardBySlug } from '../state/useBoardBySlug.js';
import { useProvider } from '../provider/ProviderContext.js';

/**
 * Board page — rendered at route `/boards/:slug`.
 * Loads the board matching the slug param and renders the full kanban board.
 */
export function BoardPage(): React.ReactElement {
  const { slug = '' } = useParams<{ slug: string }>();
  const { status, board, boardId, columns, swimlanes, items } = useBoardBySlug(slug);
  const provider = useProvider();
  const [creating, setCreating] = useState(false);

  const handleCreateDefault = useCallback(async (): Promise<void> => {
    setCreating(true);
    try {
      const newBoard = await provider.createBoard({
        slug,
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: '',
      });
      await provider.createColumn({ boardId: newBoard.id, title: 'To Do', order: 0 });
      await provider.createColumn({ boardId: newBoard.id, title: 'In Progress', order: 1 });
      await provider.createColumn({ boardId: newBoard.id, title: 'Done', order: 2 });
      await provider.createSwimlane({ boardId: newBoard.id, title: 'Default', order: 0 });
    } finally {
      setCreating(false);
    }
  }, [provider, slug]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading">
        <span className="text-gray-400 text-lg">Loading…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="flex items-center justify-center h-full text-red-500"
        data-testid="error-state"
      >
        Failed to load board. Please refresh.
      </div>
    );
  }

  if (status === 'empty' || board === null || boardId === null) {
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
          No board with this slug exists in the current provider.
        </p>
        <div className="flex gap-3">
          <Link
            to="/"
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            data-testid="back-to-list"
          >
            ← All Boards
          </Link>
          <button
            type="button"
            onClick={() => void handleCreateDefault()}
            disabled={creating}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            data-testid="create-board-btn"
          >
            {creating ? 'Creating…' : 'Create This Board'}
          </button>
        </div>
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
        <span className="text-sm text-gray-600 font-medium">{board.title}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <Board
          board={board}
          boardId={boardId}
          columns={columns}
          swimlanes={swimlanes}
          items={items}
        />
      </div>
    </div>
  );
}
