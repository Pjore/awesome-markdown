import React, { useEffect } from 'react';

interface DrawerProps {
  kind: string;
  title: string;
  testId: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Right-hand settings panel; Escape closes it. */
export function Drawer({
  kind,
  title,
  testId,
  onClose,
  children,
}: DrawerProps): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="drawer" role="dialog" aria-label={`${kind} settings`} data-testid={testId}>
      <div className="drawer-header">
        <span className="drawer-kind">{kind}</span>
        <h3>{title}</h3>
        <button
          type="button"
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<[T, string]>;
  onChange: (value: T) => void;
  testId?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  testId,
}: SegmentedProps<T>): React.ReactElement {
  return (
    <div className="segs" role="group" data-testid={testId}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className="seg"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
