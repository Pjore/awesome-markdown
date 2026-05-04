import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import type { Item } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import { useBreadcrumb } from '../App.js';

interface EditorLocationState {
  boardSlug?: string;
  from?: string;
}

/**
 * Full-page item editor.
 *
 * Route: /items/:slug
 *
 * Layout:
 * - Mono slug label (top)
 * - Inter Tight title input
 * - Mono body textarea
 * - Save / Cancel action row
 *
 * Breadcrumb: boards / <boardSlug> → items / <slug> (when origin board known)
 * Cancel: returns to originating board or "/" if unknown.
 */
export function ItemEditorPage(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const provider = useProvider();
  const { setSegments } = useBreadcrumb();

  const state = (location.state ?? {}) as EditorLocationState;
  const boardSlug = state.boardSlug;
  const backPath = state.from ?? (boardSlug ? `/boards/${boardSlug}` : '/');

  const [item, setItem] = useState<Item | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Fetch item on mount
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    provider
      .getItem(slug)
      .then((fetched) => {
        if (!fetched) {
          setError(`Item "${slug}" not found.`);
          return;
        }
        setItem(fetched);
        setTitle(fetched.title);
        setBody(fetched.body ?? '');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load item.');
      })
      .finally(() => setLoading(false));
  }, [slug, provider]);

  // Push breadcrumb segments
  useEffect(() => {
    const segments = boardSlug
      ? [
          { label: 'boards', to: '/' },
          { label: boardSlug, to: `/boards/${boardSlug}` },
          { label: 'items' },
          { label: slug ?? '' },
        ]
      : [{ label: 'items' }, { label: slug ?? '' }];
    setSegments(segments);
    return () => setSegments([]);
  }, [slug, boardSlug, setSegments]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!slug || !item) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title cannot be empty.');
      return;
    }

    setSaving(true);
    setError(null);

    const mutations: Array<{ op: 'set'; path: string; value: string }> = [];
    if (trimmedTitle !== item.title) {
      mutations.push({ op: 'set', path: 'title', value: trimmedTitle });
    }
    if (body !== (item.body ?? '')) {
      mutations.push({ op: 'set', path: 'body', value: body });
    }

    if (mutations.length === 0) {
      navigate(backPath);
      return;
    }

    try {
      await provider.patchItem(slug, { mutations });
      navigate(backPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }, [slug, item, title, body, provider, navigate, backPath]);

  const handleCancel = useCallback((): void => {
    navigate(backPath);
  }, [navigate, backPath]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setTitle(e.target.value);
    setDirty(true);
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setBody(e.target.value);
    setDirty(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      void handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          color: 'var(--ink-muted)',
        }}
        data-testid="item-editor-loading"
      >
        loading…
      </div>
    );
  }

  if (error && !item) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '12px',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          color: 'var(--ink-muted)',
        }}
        data-testid="item-editor-error"
      >
        <span>{error}</span>
        <button
          type="button"
          onClick={handleCancel}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--ink-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          ← back
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
      onKeyDown={handleKeyDown}
      data-testid="item-editor"
    >
      {/* Slug label */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 400,
          color: 'var(--ink-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
        data-testid="item-editor-slug"
      >
        {slug}
      </div>

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        placeholder="Title"
        disabled={saving}
        autoFocus
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '22px',
          fontWeight: 500,
          color: 'var(--ink)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          borderRadius: 0,
          padding: '4px 0',
          width: '100%',
          outline: 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--accent)'; }}
        onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'var(--border)'; }}
        data-testid="item-editor-title"
      />

      {/* Body textarea */}
      <textarea
        value={body}
        onChange={handleBodyChange}
        placeholder="Add a description…"
        disabled={saving}
        rows={16}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          fontWeight: 400,
          color: 'var(--ink)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 0,
          padding: '12px',
          width: '100%',
          resize: 'vertical',
          outline: 'none',
          lineHeight: 1.6,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        data-testid="item-editor-body"
      />

      {/* Error message */}
      {error && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--ink)',
            borderLeft: '2px solid var(--ink-muted)',
            paddingLeft: '12px',
          }}
          data-testid="item-editor-save-error"
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          borderTop: '1px solid var(--border)',
          paddingTop: '16px',
        }}
      >
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            background: dirty && !saving ? 'var(--ink)' : 'var(--border)',
            color: dirty && !saving ? 'var(--bg)' : 'var(--ink-muted)',
            border: 'none',
            borderRadius: 0,
            padding: '6px 16px',
            cursor: saving || !dirty ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.1s',
          }}
          data-testid="item-editor-save"
        >
          {saving ? 'saving…' : 'save'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--ink-muted)',
            background: 'none',
            border: 'none',
            borderRadius: 0,
            padding: '6px 8px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
          data-testid="item-editor-cancel"
        >
          cancel
        </button>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--ink-muted)',
            marginLeft: 'auto',
          }}
        >
          {saving ? '' : '⌘S to save · Esc to cancel'}
        </span>
      </div>
    </div>
  );
}
