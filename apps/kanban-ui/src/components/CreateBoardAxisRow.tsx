import React from 'react';

export interface DraftAxis {
  id: string;
  kind: 'column' | 'swimlane';
  title: string;
  property: string;
  value: string;
}

interface CreateBoardAxisRowProps {
  axis: DraftAxis;
  disabled?: boolean;
  onChange: (id: string, patch: Partial<DraftAxis>) => void;
  onRemove: (id: string) => void;
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '13px',
  color: 'var(--ink)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 0,
  padding: '6px 8px',
  outline: 'none',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: 'var(--ink-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

/**
 * One row in the "add board" form's axis list — lets the user define a
 * single column or swimlane axis with a simple `property equals value`
 * membership filter.
 */
export function CreateBoardAxisRow({
  axis,
  disabled = false,
  onChange,
  onRemove,
}: CreateBoardAxisRowProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 1fr 1fr auto',
        gap: '8px',
        alignItems: 'end',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
      data-testid={`create-board-axis-row-${axis.id}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={labelStyle}>Kind</span>
        <select
          value={axis.kind}
          disabled={disabled}
          onChange={(e) => onChange(axis.id, { kind: e.target.value as DraftAxis['kind'] })}
          style={inputStyle}
          data-testid={`create-board-axis-kind-${axis.id}`}
        >
          <option value="column">Column</option>
          <option value="swimlane">Swimlane</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={labelStyle}>Title</span>
        <input
          type="text"
          value={axis.title}
          disabled={disabled}
          onChange={(e) => onChange(axis.id, { title: e.target.value })}
          placeholder="e.g. In Progress"
          style={inputStyle}
          data-testid={`create-board-axis-title-${axis.id}`}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={labelStyle}>Property</span>
        <input
          type="text"
          value={axis.property}
          disabled={disabled}
          onChange={(e) => onChange(axis.id, { property: e.target.value })}
          placeholder="e.g. status"
          style={inputStyle}
          data-testid={`create-board-axis-property-${axis.id}`}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={labelStyle}>Value</span>
        <input
          type="text"
          value={axis.value}
          disabled={disabled}
          onChange={(e) => onChange(axis.id, { value: e.target.value })}
          placeholder="e.g. in-progress"
          style={inputStyle}
          data-testid={`create-board-axis-value-${axis.id}`}
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(axis.id)}
        disabled={disabled}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--ink-muted)',
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '6px 4px',
        }}
        data-testid={`create-board-axis-remove-${axis.id}`}
      >
        remove
      </button>
    </div>
  );
}
