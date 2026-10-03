import React from 'react';

interface BoardAssigneeFieldProps {
  boardSlug: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function BoardAssigneeField({
  boardSlug,
  value,
  disabled = false,
  onChange,
}: BoardAssigneeFieldProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        borderTop: '1px solid var(--border)',
        paddingTop: '16px',
      }}
      data-testid="item-editor-assignee-section"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label
          htmlFor="item-editor-assignee"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--ink-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Board assignee
        </label>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--ink-muted)',
          }}
        >
          Saved to boards.{boardSlug}.assignee for this board.
        </span>
      </div>
      <input
        id="item-editor-assignee"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Unassigned"
        disabled={disabled}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 400,
          color: 'var(--ink)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 0,
          padding: '10px 12px',
          width: '100%',
          outline: 'none',
        }}
        onFocus={(event) => {
          event.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onBlur={(event) => {
          event.currentTarget.style.borderColor = 'var(--border)';
        }}
        data-testid="item-editor-assignee"
      />
    </div>
  );
}
