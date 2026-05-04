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
      className="border-t border-amber-200 bg-amber-50"
      data-testid="homeless-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
        data-testid="homeless-panel-toggle"
        aria-expanded={open}
      >
        <span>
          ⚠ {items.length} homeless item{items.length !== 1 ? 's' : ''} on &quot;
          {homeless.board.title}&quot;
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul
          className="px-4 pb-3 flex flex-wrap gap-2"
          data-testid="homeless-item-list"
        >
          {items.map((item) => (
            <li
              key={item.slug}
              className="bg-white border border-amber-200 rounded px-3 py-1 text-sm text-gray-700 shadow-sm"
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
