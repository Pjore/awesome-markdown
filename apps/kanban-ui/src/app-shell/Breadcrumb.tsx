import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BreadcrumbContext } from '../App.js';
import type { BreadcrumbSegment } from '../App.js';

/**
 * Route-aware breadcrumb rendered in the top bar center.
 *
 * Reads segments from BreadcrumbContext (set by pages via useBreadcrumb).
 * Default when no segments: [{ label: 'boards', to: '/' }].
 *
 * Renders as a path: boards / board-all
 * All text in --font-mono, small size, muted.
 */
export function Breadcrumb(): React.ReactElement {
  const { segments } = useContext(BreadcrumbContext);
  useLocation(); // re-render on route change

  const allSegments: BreadcrumbSegment[] =
    segments.length > 0 ? segments : [{ label: 'boards', to: '/' }];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
      data-testid="breadcrumb"
    >
      {allSegments.map((seg, i) => (
        <React.Fragment key={`${seg.label}-${i}`}>
          {i > 0 && (
            <span style={{ color: 'var(--ink-muted)' }} aria-hidden="true">
              {' / '}
            </span>
          )}
          {seg.to !== undefined ? (
            <Link
              to={seg.to}
              style={{ color: 'var(--ink-muted)', textDecoration: 'none' }}
              className="hover:underline"
            >
              {seg.label}
            </Link>
          ) : (
            <span style={{ color: 'var(--ink)' }}>{seg.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
