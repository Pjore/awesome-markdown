import React from 'react';

interface ItemEditorActionsProps {
  saving: boolean;
  deleting: boolean;
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDeleteRequest: () => void;
}

/**
 * Save / cancel / delete action bar for the item detail page (ItemEditorPage).
 */
export function ItemEditorActions({
  saving,
  deleting,
  dirty,
  onSave,
  onCancel,
  onDeleteRequest,
}: ItemEditorActionsProps): React.ReactElement {
  return (
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
        onClick={onSave}
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
        onClick={onCancel}
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
      <button
        type="button"
        onClick={onDeleteRequest}
        disabled={saving || deleting}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--ink-muted)',
          background: 'none',
          border: 'none',
          borderRadius: 0,
          padding: '6px 8px',
          cursor: saving || deleting ? 'not-allowed' : 'pointer',
        }}
        data-testid="item-editor-delete"
      >
        delete
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
  );
}
