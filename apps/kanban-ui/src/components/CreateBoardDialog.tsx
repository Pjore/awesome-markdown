import React, { useState } from 'react';
import type { Board, CreateAxisRequest } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import { CreateBoardAxisRow } from './CreateBoardAxisRow.js';
import type { DraftAxis } from './CreateBoardAxisRow.js';

interface CreateBoardDialogProps {
  onClose: () => void;
  onCreated: (board: Board) => void;
}

/** Slugify a title string to a valid slug (mirrors board/Cell.tsx). */
function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.length > 0 ? s : 'untitled';
}

let axisIdCounter = 0;
function nextAxisId(): string {
  axisIdCounter += 1;
  return `axis-${axisIdCounter}`;
}

function makeDraftAxis(kind: DraftAxis['kind']): DraftAxis {
  return { id: nextAxisId(), kind, title: '', property: '', value: '' };
}

/**
 * Modal form for creating a new board with an arbitrary set of column
 * and/or swimlane axes, each backed by a simple `property equals value`
 * membership filter.
 *
 * On submit: creates each axis via `provider.createAxis`, then creates the
 * board via `provider.createBoard` referencing the resulting axis slugs.
 */
export function CreateBoardDialog({
  onClose,
  onCreated,
}: CreateBoardDialogProps): React.ReactElement {
  const provider = useProvider();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [axes, setAxes] = useState<DraftAxis[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateAxis = (id: string, patch: Partial<DraftAxis>): void => {
    setAxes((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeAxis = (id: string): void => {
    setAxes((prev) => prev.filter((a) => a.id !== id));
  };

  const addAxis = (kind: DraftAxis['kind']): void => {
    setAxes((prev) => [...prev, makeDraftAxis(kind)]);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Board title is required.');
      return;
    }
    for (const axis of axes) {
      if (!axis.title.trim() || !axis.property.trim() || !axis.value.trim()) {
        setError('Each axis needs a title, property, and value.');
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const boardSlug = slugify(trimmedTitle);

      // Assign unique axis slugs (append -2, -3, ... on collision within this form).
      const usedSlugs = new Set<string>();
      const slugFor = (t: string): string => {
        const base = slugify(t);
        let candidate = base;
        let suffix = 2;
        while (usedSlugs.has(candidate)) {
          candidate = `${base}-${suffix}`;
          suffix += 1;
        }
        usedSlugs.add(candidate);
        return candidate;
      };

      const columns: string[] = [];
      const swimlanes: string[] = [];

      for (const axis of axes) {
        const axisSlug = slugFor(axis.title.trim());
        const req: CreateAxisRequest = {
          slug: axisSlug,
          title: axis.title.trim(),
          filter: { property: axis.property.trim(), equals: axis.value.trim() },
        };
        await provider.createAxis(req);
        if (axis.kind === 'column') columns.push(axisSlug);
        else swimlanes.push(axisSlug);
      }

      const board = await provider.createBoard({
        slug: boardSlug,
        title: trimmedTitle,
        description: description.trim() || undefined,
        columns: columns.length > 0 ? columns : undefined,
        swimlanes: swimlanes.length > 0 ? swimlanes : undefined,
      });

      onCreated(board);
    } catch (err) {
      setError(`Failed to create board: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      data-testid="create-board-dialog"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 0,
          padding: '24px',
          width: '640px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
          Add board
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="create-board-title" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
            Title
          </label>
          <input
            id="create-board-title"
            type="text"
            value={title}
            disabled={saving}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Roadmap"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              color: 'var(--ink)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 0,
              padding: '8px 10px',
              outline: 'none',
            }}
            data-testid="create-board-title-input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="create-board-description" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
            Description (optional)
          </label>
          <input
            id="create-board-description"
            type="text"
            value={description}
            disabled={saving}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              color: 'var(--ink)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 0,
              padding: '8px 10px',
              outline: 'none',
            }}
            data-testid="create-board-description-input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>Axes (columns / swimlanes)</span>
          {axes.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              No axes yet — the board will show all items in a single cell.
            </span>
          ) : (
            <div data-testid="create-board-axis-list">
              {axes.map((axis) => (
                <CreateBoardAxisRow
                  key={axis.id}
                  axis={axis}
                  disabled={saving}
                  onChange={updateAxis}
                  onRemove={removeAxis}
                />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => addAxis('column')}
              disabled={saving}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--ink)',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 0,
                padding: '6px 10px',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
              data-testid="create-board-add-column"
            >
              + column
            </button>
            <button
              type="button"
              onClick={() => addAxis('swimlane')}
              disabled={saving}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--ink)',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 0,
                padding: '6px 10px',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
              data-testid="create-board-add-swimlane"
            >
              + swimlane
            </button>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#E53E3E' }} data-testid="create-board-error">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
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
            data-testid="create-board-cancel"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              background: 'var(--ink)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 0,
              padding: '6px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
            data-testid="create-board-submit"
          >
            {saving ? 'creating…' : 'create board'}
          </button>
        </div>
      </form>
    </div>
  );
}
