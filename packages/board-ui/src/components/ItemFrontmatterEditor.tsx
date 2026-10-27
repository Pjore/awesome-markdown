import React from 'react';

interface Props {
  rawMode: boolean;
  value: string;
  disabled: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}

export function ItemFrontmatterEditor({
  rawMode,
  value,
  disabled,
  onToggle,
  onChange,
}: Props): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={rawMode}
        aria-controls="item-frontmatter"
        data-testid="item-editor-frontmatter-toggle"
        style={{
          alignSelf: 'flex-start',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--ink-muted)',
          background: 'none',
          border: '1px solid var(--border)',
          padding: '6px 10px',
          cursor: 'pointer',
        }}
      >
        {rawMode ? '← edit fields' : 'edit raw frontmatter →'}
      </button>
      {rawMode && (
        <div id="item-frontmatter" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            htmlFor="item-frontmatter-yaml"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink)' }}
          >
            Frontmatter · YAML
          </label>
          <p
            id="item-frontmatter-help"
            style={{ margin: 0, fontSize: '12px', color: 'var(--ink-muted)' }}
          >
            All metadata, including custom properties and board entries. Slug and entityType must
            stay unchanged; updatedAt is managed automatically. The description below is separate.
          </p>
          <textarea
            id="item-frontmatter-yaml"
            aria-describedby="item-frontmatter-help"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            rows={18}
            data-testid="item-editor-frontmatter"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--ink)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 0,
              padding: '12px',
              width: '100%',
              resize: 'vertical',
              lineHeight: 1.6,
            }}
          />
        </div>
      )}
    </div>
  );
}
