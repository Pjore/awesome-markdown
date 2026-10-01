import React, { useState } from 'react';
import type { Axis, PatchAxisRequest } from '@awesome-markdown/contracts';
import { Drawer } from './Drawer.js';
import { FilterEditor } from './FilterEditor.js';
import { fromDraft, toDraft, filterSummary } from './filter-draft.js';
import type { FilterDraft } from './filter-draft.js';
import {
  DropEditor,
  OrderEditor,
  fromDropDraft,
  fromOrderDraft,
  toDropDraft,
  toOrderDraft,
} from './AxisBehavior.js';
import type { AxisDim } from './axis-defaults.js';
import type { AxisUsage } from './useBoardLayout.js';

interface AxisDrawerProps {
  axis: Axis;
  dim: AxisDim;
  boardSlug: string;
  usage: AxisUsage[];
  onSave: (patch: PatchAxisRequest) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  onClose: () => void;
}

/** Detailed settings for one column / swimlane: title, filter, card order and drop behaviour. */
export function AxisDrawer({
  axis,
  dim,
  boardSlug,
  usage,
  onSave,
  onRemove,
  onClose,
}: AxisDrawerProps): React.ReactElement {
  const noun = dim === 'columns' ? 'column' : 'swimlane';
  const [title, setTitle] = useState(axis.title);
  const [filter, setFilter] = useState<FilterDraft | null>(() => toDraft(axis.filter));
  const [order, setOrder] = useState(() => toOrderDraft(axis.order));
  const [drop, setDrop] = useState(() => toDropDraft(axis.writeOnDrop));
  const [busy, setBusy] = useState(false);

  const rule = filter ? fromDraft(filter) : axis.filter;

  const save = async (): Promise<void> => {
    const patch: PatchAxisRequest = {
      title: title.trim() || axis.title,
      writeOnDrop: fromDropDraft(drop),
    };
    if (filter) patch.filter = rule ?? null;
    if (dim === 'columns') patch.order = fromOrderDraft(order);
    setBusy(true);
    const ok = await onSave(patch);
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    if (await onRemove()) onClose();
    else setBusy(false);
  };

  return (
    <Drawer kind={noun} title={axis.title} testId="axis-drawer" onClose={onClose}>
      {axis.synthetic ? (
        <p className="warn">
          No axis file exists for <code>{axis.slug}</code>, so there is nothing to configure. Remove
          it from the board or add <code>{axis.slug}.md</code> to the content folder.
        </p>
      ) : (
        <>
          {usage.length > 0 && (
            <p className="notice" data-testid="axis-shared-notice">
              Shared: also used on{' '}
              {usage.map((u, i) => (
                <React.Fragment key={`${u.board}-${u.dim}`}>
                  {i > 0 && ', '}
                  <code>{u.board}</code> as a {u.dim === 'columns' ? 'column' : 'swimlane'}
                </React.Fragment>
              ))}
              . Changes here apply there too.
            </p>
          )}
          <label className="field">
            <span className="field-label">title · content/{axis.slug}.md</span>
            <input
              className="input input-sans"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="axis-title-input"
            />
          </label>

          <section className="drawer-section">
            <h4>Filter</h4>
            <p className="help">A card appears in this {noun} when it matches:</p>
            {filter ? (
              <FilterEditor
                draft={filter}
                onChange={setFilter}
                emptyText={`No conditions — every card on the board appears in this ${noun}.`}
                testId="axis-filter-editor"
              />
            ) : (
              <p className="warn">
                This filter uses nested groups (<code>{filterSummary(axis.filter)}</code>). Edit it
                in <code>{axis.slug}.md</code>.
              </p>
            )}
          </section>

          <section className="drawer-section">
            <h4>Card order</h4>
            {dim === 'columns' ? (
              <OrderEditor draft={order} boardSlug={boardSlug} onChange={setOrder} />
            ) : (
              <p className="help">
                Swimlanes don&apos;t sort cards — each cell uses its column&apos;s order.
              </p>
            )}
          </section>

          <section className="drawer-section">
            <h4>When a card is dropped here</h4>
            <DropEditor
              draft={drop}
              filter={rule}
              boardSlug={boardSlug}
              noun={noun}
              onChange={setDrop}
            />
          </section>
        </>
      )}

      <div className="drawer-footer">
        <button
          type="button"
          className="link-btn"
          disabled={busy}
          onClick={() => void remove()}
          data-testid="axis-remove"
        >
          Remove from board
        </button>
        <span className="help" style={{ fontSize: '11px' }}>
          the axis file is kept
        </span>
        {!axis.synthetic && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            disabled={busy}
            onClick={() => void save()}
            data-testid="axis-save"
          >
            {busy ? 'saving…' : 'Save'}
          </button>
        )}
      </div>
    </Drawer>
  );
}
