import React from 'react';

interface DeleteItemConfirmDialogProps {
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal confirmation dialog shown before permanently deleting an item from
 * the item detail page (ItemEditorPage).
 */
export function DeleteItemConfirmDialog({
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteItemConfirmDialogProps): React.ReactElement {
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
      data-testid="item-editor-delete-confirm"
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 0,
          padding: '24px',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
          Delete this item? This cannot be undone.
        </div>
        {error && <div style={{ fontSize: '12px', color: 'var(--ink)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--ink-muted)',
              background: 'none',
              border: 'none',
              borderRadius: 0,
              padding: '6px 8px',
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
            data-testid="item-editor-delete-cancel"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              background: 'var(--ink)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 0,
              padding: '6px 16px',
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
            data-testid="item-editor-delete-confirm-button"
          >
            {deleting ? 'deleting…' : 'delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
