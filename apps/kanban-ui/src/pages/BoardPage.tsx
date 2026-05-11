import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Board } from '../board/Board.js';
import { useBoardRender } from '../state/useBoardRender.js';
import { useBreadcrumb } from '../App.js';

/**
 * Board page — rendered at route `/boards/:slug`.
 * Loads the board's render envelope and renders the full kanban board.
 */
export function BoardPage(): React.ReactElement {
  const { slug = '' } = useParams<{ slug: string }>();
  const { status, render, homeless, refetch } = useBoardRender(slug);
  const { setSegments } = useBreadcrumb();

  useEffect(() => {
    setSegments([
      { label: 'boards', to: '/' },
      { label: slug },
    ]);
    return () => setSegments([]);
  }, [slug, setSegments]);

  if (status === 'loading' || (status !== 'error' && render === null)) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading">
        <span style={{ color: 'var(--ink-muted)', fontSize: '1.125rem' }}>Loading…</span>
      </div>
    );
  }

  if (status === 'error' || render === null) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-center p-8"
        data-testid="board-not-found"
      >
        <h2
          style={{ fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '16px', marginBottom: '8px' }}
        >
          Board &quot;{slug}&quot; not found
        </h2>
        <p style={{ color: 'var(--ink-muted)', marginBottom: '24px', maxWidth: '360px' }}>
          No board with this slug exists in the current provider, or it failed to load.
        </p>
        <Link
          to="/"
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            color: 'var(--ink)',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
          data-testid="back-to-list"
        >
          ← all boards
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="board-page">
      <div className="flex-1 overflow-hidden">
        <Board render={render} homeless={homeless} onRefetch={refetch} />
      </div>
    </div>
  );
}

