import React, { useState } from 'react';
import type { Homeless, Item } from '@awesome-markdown/contracts';
import { HomelessItemCard } from './HomelessItemCard.js';

interface HomelessPanelProps {
  homeless: Homeless;
  /**
   * When provided, overrides `homeless.items` for rendering (e.g. to hide
   * items that have been optimistically moved into a cell).
   */
  items?: Item[];
}

/**
 * Collapsible panel listing items that belong to this board but no longer
 * match any column filter. Populated from GET /boards/:slug/homeless.
 */
export function HomelessPanel({ homeless, items: itemsProp }: HomelessPanelProps): React.ReactElement {
  const [open, setOpen] = useState(true);
  const items = itemsProp ?? homeless.items;

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
            <HomelessItemCard key={item.slug} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
