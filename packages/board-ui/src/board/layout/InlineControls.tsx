import React, { useState } from 'react';

interface InlineTextInputProps {
  initial: string;
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  /** Called with the trimmed value on Enter or blur; skipped when empty. */
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/** Autofocused single-line input that commits on Enter/blur and cancels on Escape. */
export function InlineTextInput({
  initial,
  placeholder,
  ariaLabel,
  testId,
  onCommit,
  onCancel,
}: InlineTextInputProps): React.ReactElement {
  const [value, setValue] = useState(initial);
  const [done, setDone] = useState(false);

  const finish = (commit: boolean): void => {
    if (done) return;
    setDone(true);
    const trimmed = value.trim();
    if (commit && trimmed !== '' && trimmed !== initial) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      className="inline-input"
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
    />
  );
}

export function PencilIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z" />
      <path d="M9.5 4l2.5 2.5" />
    </svg>
  );
}

interface AddAxisButtonProps {
  label: 'column' | 'swimlane';
  onAdd: (title: string) => void;
  style?: React.CSSProperties;
}

/** "+" that turns into a title input; Enter adds the axis with default filter and order. */
export function AddAxisButton({ label, onAdd, style }: AddAxisButtonProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div
        style={{ ...style, padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
      >
        <InlineTextInput
          initial=""
          placeholder={`${label} title`}
          ariaLabel={`New ${label} title`}
          testId={`add-${label}-input`}
          onCommit={(title) => {
            setEditing(false);
            onAdd(title);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="plus-btn"
      style={style}
      title={`Add ${label}`}
      aria-label={`Add ${label}`}
      data-testid={`add-${label}-button`}
      onClick={() => setEditing(true)}
    >
      +
    </button>
  );
}
