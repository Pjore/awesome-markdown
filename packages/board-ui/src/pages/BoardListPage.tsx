import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { Board } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import { useProviderSubscribe } from '../state/useProviderSubscribe.js';
import { InlineTextInput } from '../board/layout/InlineControls.js';
import { slugify, uniqueSlug } from '../board/layout/axis-defaults.js';
import { RouterLink, useRouterAdapter } from '../router/RouterAdapter.js';

/**
 * Board list page — rendered at route `/`.
 * Lists all boards from the current provider; each links to `/boards/:slug`.
 * "+ add board" asks for a title, creates an empty board and opens it —
 * columns and swimlanes are then added on the board itself.
 */
export function BoardListPage(): React.ReactElement {
  const provider = useProvider();
  const { navigate } = useRouterAdapter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createBoard = async (title: string): Promise<void> => {
    setCreating(false);
    try {
      const taken = new Set((await provider.listBoards()).map((b) => b.slug));
      const board = await provider.createBoard({ slug: uniqueSlug(slugify(title, 'board'), taken), title });
      navigate(`/boards/${board.slug}`);
    } catch (err) {
      setCreateError(`Failed to create board: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '20px',
            fontWeight: 500,
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Your Boards
        </h2>
        {creating ? (
          <div style={{ width: '240px', fontFamily: 'var(--font-sans)', fontSize: '14px', padding: '6px 0' }}>
            <InlineTextInput
              initial=""
              placeholder="Board title"
              ariaLabel="New board title"
              testId="create-board-title-input"
              onCommit={(title) => void createBoard(title)}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : (
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setCreating(true);
          }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--ink)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 0,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
          data-testid="add-board-button"
        >
          + add board
        </button>
        )}
      </div>

      {createError !== null && (
        <p style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '12px', marginBottom: '16px' }} role="alert" data-testid="create-board-error">
          {createError}
        </p>
      )}

      {boards.length === 0 ? (
        <div className="text-center py-16" data-testid="board-list-empty">
          <p style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>No boards yet. Use + add board to create one.</p>
        </div>
      ) : (
        <ul className="space-y-3" style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="board-list-items">
          {boards.map((board) => (
            <li key={board.slug}>
              <RouterLink
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
              </RouterLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

