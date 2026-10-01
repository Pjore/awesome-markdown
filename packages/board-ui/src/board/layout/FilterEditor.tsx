import React from 'react';
import { COND_OPS } from './filter-draft.js';
import type { CondDraft, CondOp, FilterDraft } from './filter-draft.js';

interface FilterEditorProps {
  draft: FilterDraft;
  onChange: (draft: FilterDraft) => void;
  emptyText: string;
  testId: string;
}

/** Flat condition builder: property / operator / value rows joined by all or any. */
export function FilterEditor({
  draft,
  onChange,
  emptyText,
  testId,
}: FilterEditorProps): React.ReactElement {
  const setCond = (i: number, patch: Partial<CondDraft>): void =>
    onChange({ ...draft, conds: draft.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const removeCond = (i: number): void =>
    onChange({ ...draft, conds: draft.conds.filter((_, j) => j !== i) });
  const addCond = (): void =>
    onChange({ ...draft, conds: [...draft.conds, { property: '', op: 'equals', value: '' }] });

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {draft.conds.length > 1 && (
        <label className="help flex items-center gap-2">
          Match
          <select
            className="input"
            value={draft.combinator}
            onChange={(e) =>
              onChange({ ...draft, combinator: e.target.value as FilterDraft['combinator'] })
            }
          >
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          of these conditions
        </label>
      )}
      {draft.conds.length === 0 && <p className="help">{emptyText}</p>}
      {draft.conds.map((c, i) => (
        <div key={i} className="cond-row">
          <input
            className="input"
            placeholder="property"
            aria-label="Property"
            value={c.property}
            onChange={(e) => setCond(i, { property: e.target.value })}
          />
          <select
            className="input"
            aria-label="Operator"
            value={c.op}
            onChange={(e) => setCond(i, { op: e.target.value as CondOp })}
          >
            {COND_OPS.map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>
          {c.op === 'exists' || c.op === 'missing' ? (
            <span />
          ) : (
            <input
              className="input"
              placeholder={c.op === 'in' ? 'a, b, c' : 'value'}
              aria-label="Value"
              value={c.value}
              onChange={(e) => setCond(i, { value: e.target.value })}
            />
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove condition"
            onClick={() => removeCond(i)}
          >
            ✕
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="link-btn" onClick={addCond}>
          + condition
        </button>
      </div>
    </div>
  );
}
