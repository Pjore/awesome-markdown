import React from 'react';
import type { Item, PropertyDisplay } from '@awesome-markdown/contracts';

/**
 * Resolves a property's value for an item on a given board.
 *
 * Per-board entries (`item.boards[].<property>`) take precedence over the
 * item's top-level property of the same name.
 */
export function resolveItemProperty(item: Item, boardSlug: string, property: string): unknown {
  const boardEntry = item.boards?.find((b) => b.board === boardSlug) as
    | Record<string, unknown>
    | undefined;
  if (boardEntry && property in boardEntry) return boardEntry[property];
  return (item as unknown as Record<string, unknown>)[property];
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function initials(value: string): string {
  const parts = value.trim().split(/[\s_-]+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0]![0], parts[1]![0]] : [value.slice(0, 2)];
  return chars.join('').toUpperCase();
}

interface PropertyValueProps {
  item: Item;
  boardSlug: string;
  layout: PropertyDisplay;
}

/** Renders a single configured property according to its `visualStyle`. */
export function PropertyValueDisplay({ item, boardSlug, layout }: PropertyValueProps): React.ReactElement | null {
  const raw = resolveItemProperty(item, boardSlug, layout.property);
  const text = formatValue(raw);
  if (text === '') return null;

  const label = layout.label ?? layout.property;
  const testId = `property-${layout.property}-${item.slug}`;

  if (layout.visualStyle === 'badge') {
    return (
      <span
        title={label}
        data-testid={testId}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10.5px',
          fontWeight: 500,
          color: 'var(--ink)',
          background: 'var(--accent)',
          padding: '1px 6px',
          borderRadius: 0,
          display: 'inline-block',
        }}
      >
        {text}
      </span>
    );
  }

  if (layout.visualStyle === 'tag') {
    return (
      <span
        title={label}
        data-testid={testId}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10.5px',
          fontWeight: 400,
          color: 'var(--ink-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {text}
      </span>
    );
  }

  if (layout.visualStyle === 'avatar') {
    return (
      <span
        title={`${label}: ${text}`}
        data-testid={testId}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--bg)',
          background: 'var(--ink)',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {initials(text)}
      </span>
    );
  }

  // 'text' (default)
  return (
    <span
      data-testid={testId}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '11.5px',
        fontWeight: 400,
        color: 'var(--ink-muted)',
      }}
    >
      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{label}:</span> {text}
    </span>
  );
}
