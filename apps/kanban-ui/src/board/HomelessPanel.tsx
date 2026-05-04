import React, { useState } from 'react';
import type { Homeless } from '@awesome-markdown/contracts';

interface HomelessPanelProps {
  homeless: Homeless;
}

/**
 * Collapsible panel listing items that belong to this board but no longer
 * match any column filter. Populated from GET /boards/:slug/homeless.
 */
export function HomelessPanel({ homeless }: HomelessPanelProps): React.ReactElement {
  const [open, setOpen] = useState(true);
  const { items } = homeless;

  if (items.length === 0) return <></>;

  return (
    <div
      style={{ borderTop: '1px solid var(--border)' }}
      data-testid="homeless-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--ink-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          background: 'var(--bg)',
          border: 'none',
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
        data-testid="homeless-panel-toggle"
        aria-expanded={open}
      >
        <span>
          ⚠ {items.length} homeless item{items.length !== 1 ? 's' : ''} — &quot;
          {homeless.board.title}&quot;
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul
          className="px-4 pb-3 flex flex-wrap gap-2"
          style={{ paddingTop: '8px' }}
          data-testid="homeless-item-list"
        >
          {items.map((item) => (
            <li
              key={item.slug}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
                padding: '2px 10px',
                background: 'var(--bg)',
              }}
              data-testid={`homeless-item-${item.slug}`}
              data-item-slug={item.slug}
            >
              {item.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
