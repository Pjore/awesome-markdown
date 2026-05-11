import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Board } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import { useProviderSubscribe } from '../state/useProviderSubscribe.js';

/**
 * Board list page — rendered at route `/`.
 * Lists all boards from the current provider; each links to `/boards/:slug`.
 */
export function BoardListPage(): React.ReactElement {
  const provider = useProvider();
  const [boards, setBoards] = useState<Board[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await provider.listBoards();
      if (!cancelledRef.current) {
        setBoards(result);
        setStatus('ready');
      }
    } catch (err) {
      console.error('Failed to list boards', err);
      if (!cancelledRef.current) setStatus('error');
    }
  }, [provider]);

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  useProviderSubscribe(() => void load());

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full" data-testid="board-list-loading">
        <span style={{ color: 'var(--ink-muted)', fontSize: '1.125rem' }}>Loading boards…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: '#E53E3E' }}
        data-testid="board-list-error"
      >
        Failed to load boards. Please refresh.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto" data-testid="board-list">
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '20px',
          fontWeight: 500,
          color: 'var(--ink)',
          marginBottom: '24px',
        }}
      >
        Your Boards
      </h2>

      {boards.length === 0 ? (
        <div className="text-center py-16" data-testid="board-list-empty">
          <p style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>No boards yet. Create one via settings.</p>
        </div>
      ) : (
        <ul className="space-y-3" style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="board-list-items">
          {boards.map((board) => (
            <li key={board.slug}>
              <Link
                to={`/boards/${board.slug}`}
                data-testid={`board-link-${board.slug}`}
                onMouseEnter={() => setHoveredSlug(board.slug)}
                onMouseLeave={() => setHoveredSlug(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '16px',
                  background: 'transparent',
                  border: hoveredSlug === board.slug
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border)',
                  borderRadius: 0,
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '16px',
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}
                  data-testid={`board-title-${board.slug}`}
                >
                  {board.title}
                </span>
                {board.description && (
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      color: 'var(--ink-muted)',
                    }}
                  >
                    {board.description}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--ink-muted)',
                    marginTop: '4px',
                  }}
                >
                  /boards/{board.slug}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

