import React from 'react';
import type { AxisOrder, FilterRule, Mutation, WriteOnDrop } from '@awesome-markdown/contracts';
import { analyzeInvertibility, deriveMutations } from '@awesome-markdown/filter-engine';
import { MANUAL_ORDER } from './axis-defaults.js';
import { Segmented } from './Drawer.js';

// ---------------------------------------------------------------------------
// Card order
// ---------------------------------------------------------------------------

export interface OrderDraft {
  mode: 'manual' | 'property' | 'updated';
  by: string;
  direction: AxisOrder['direction'];
}

export function toOrderDraft(order: AxisOrder | undefined): OrderDraft {
  if (!order) return { mode: 'updated', by: '', direction: 'asc' };
  if (order.by === MANUAL_ORDER.by) return { mode: 'manual', by: '', direction: 'asc' };
  return { mode: 'property', by: order.by, direction: order.direction };
}

export function fromOrderDraft(d: OrderDraft): AxisOrder | null {
  if (d.mode === 'manual') return MANUAL_ORDER;
  if (d.mode === 'property' && d.by.trim() !== '')
    return { by: d.by.trim(), direction: d.direction };
  return null;
}

export function OrderEditor({
  draft,
  boardSlug,
  onChange,
}: {
  draft: OrderDraft;
  boardSlug: string;
  onChange: (d: OrderDraft) => void;
}): React.ReactElement {
  return (
    <>
      <Segmented
        value={draft.mode}
        testId="axis-order-mode"
        options={[
          ['manual', 'Manual'],
          ['property', 'By property'],
          ['updated', 'Recently updated'],
        ]}
        onChange={(mode) => onChange({ ...draft, mode, by: draft.by || 'priority' })}
      />
      {draft.mode === 'manual' && (
        <p className="help">
          Cards stay where you drag them. Positions are stored per board as{' '}
          <code>boards.{boardSlug}.order</code>.
        </p>
      )}
      {draft.mode === 'property' && (
        <>
          <div className="flex gap-2 items-center">
            <input
              className="input flex-1"
              aria-label="Sort property"
              value={draft.by}
              onChange={(e) => onChange({ ...draft, by: e.target.value })}
            />
            <Segmented
              value={draft.direction}
              options={[
                ['asc', '↑ asc'],
                ['desc', '↓ desc'],
              ]}
              onChange={(direction) => onChange({ ...draft, direction })}
            />
          </div>
          <p className="help">
            Values compare as text or numbers. Dragging to reorder has no effect while sorted.
          </p>
        </>
      )}
      {draft.mode === 'updated' && <p className="help">Most recently updated cards first.</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drop behaviour (writeOnDrop)
// ---------------------------------------------------------------------------

type WriteOp = Mutation['op'];

export interface WriteDraft {
  op: WriteOp;
  path: string;
  value: string;
}

export interface DropDraft {
  mode: 'auto' | 'custom' | 'readonly';
  writes: WriteDraft[];
}

export function toDropDraft(wod: WriteOnDrop | undefined): DropDraft {
  if (!wod) return { mode: 'auto', writes: [] };
  if (!Array.isArray(wod)) return { mode: 'readonly', writes: [] };
  return {
    mode: 'custom',
    writes: wod.map((m) => ({
      op: m.op,
      path: m.path,
      value: 'value' in m ? String(m.value ?? '') : '',
    })),
  };
}

export function fromDropDraft(d: DropDraft): WriteOnDrop | null {
  if (d.mode === 'readonly') return { readonly: true };
  if (d.mode === 'auto') return null;
  const writes: Mutation[] = d.writes
    .filter((w) => w.path.trim() !== '')
    .map((w) =>
      w.op === 'delete'
        ? { op: 'delete', path: w.path.trim() }
        : { op: w.op, path: w.path.trim(), value: w.value }
    );
  return writes.length > 0 ? writes : null;
}

function describe(m: Mutation): string {
  return m.op === 'delete' ? `delete ${m.path}` : `${m.op} ${m.path}: ${String(m.value)}`;
}

export function DropEditor({
  draft,
  filter,
  boardSlug,
  noun,
  onChange,
}: {
  draft: DropDraft;
  filter: FilterRule | undefined;
  boardSlug: string;
  noun: string;
  onChange: (d: DropDraft) => void;
}): React.ReactElement {
  const derived = deriveMutations(filter, { board: boardSlug });
  const setWrite = (i: number, patch: Partial<WriteDraft>): void =>
    onChange({ ...draft, writes: draft.writes.map((w, j) => (j === i ? { ...w, ...patch } : w)) });

  const switchMode = (mode: DropDraft['mode']): void => {
    const seeded = Array.isArray(derived)
      ? toDropDraft(derived.length > 0 ? derived : undefined).writes
      : [];
    const writes = draft.writes.length > 0 ? draft.writes : seeded;
    onChange({
      mode,
      writes:
        mode === 'custom' && writes.length === 0 ? [{ op: 'set', path: '', value: '' }] : writes,
    });
  };

  return (
    <>
      <Segmented
        value={draft.mode}
        testId="axis-drop-mode"
        options={[
          ['auto', 'Automatic'],
          ['custom', 'Custom writes'],
          ['readonly', 'Read-only'],
        ]}
        onChange={switchMode}
      />
      {draft.mode === 'auto' &&
        (Array.isArray(derived) ? (
          <p className="help">
            Worked out from the filter:{' '}
            <code>{derived.map(describe).join(', ') || 'no change'}</code>
          </p>
        ) : (
          <p className="warn">
            Can&apos;t work out what to write (
            {filter ? analyzeInvertibility(filter).reasons.join('; ') : ''}). Cards can&apos;t be
            dropped in this {noun} until you choose custom writes.
          </p>
        ))}
      {draft.mode === 'custom' && (
        <>
          {draft.writes.map((w, i) => (
            <div key={i} className="write-row">
              <select
                className="input"
                aria-label="Operation"
                value={w.op}
                onChange={(e) => setWrite(i, { op: e.target.value as WriteOp })}
              >
                {(['set', 'append', 'remove', 'delete'] as const).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="property"
                aria-label="Write property"
                value={w.path}
                onChange={(e) => setWrite(i, { path: e.target.value })}
              />
              {w.op === 'delete' ? (
                <span />
              ) : (
                <input
                  className="input"
                  placeholder="value"
                  aria-label="Write value"
                  value={w.value}
                  onChange={(e) => setWrite(i, { value: e.target.value })}
                />
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove write"
                onClick={() =>
                  onChange({ ...draft, writes: draft.writes.filter((_, j) => j !== i) })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                onChange({
                  ...draft,
                  writes: [...draft.writes, { op: 'set', path: '', value: '' }],
                })
              }
            >
              + write
            </button>
          </div>
          <p className="help">
            Replaces the automatic writes. A dropped card should end up matching the filter.
          </p>
        </>
      )}
      {draft.mode === 'readonly' && (
        <p className="help">Cards can&apos;t be dropped into this {noun}.</p>
      )}
    </>
  );
}
