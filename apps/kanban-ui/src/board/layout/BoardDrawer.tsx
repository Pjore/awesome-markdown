import React, { useState } from 'react';
import type { Board, PatchBoardRequest } from '@awesome-markdown/contracts';
import { Drawer } from './Drawer.js';
import { FilterEditor } from './FilterEditor.js';
import { fromDraft, toDraft, filterSummary } from './filter-draft.js';
import type { FilterDraft } from './filter-draft.js';

interface BoardDrawerProps {
  board: Board;
  onSave: (patch: PatchBoardRequest) => Promise<boolean>;
  onClose: () => void;
}

/** Board title, description and the candidate-set filter (which cards can appear at all). */
export function BoardDrawer({ board, onSave, onClose }: BoardDrawerProps): React.ReactElement {
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description ?? '');
  const [filter, setFilter] = useState<FilterDraft | null>(() => toDraft(board.filter));
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    const patch: PatchBoardRequest = {
      title: title.trim() || board.title,
      description: description.trim() || null,
    };
    if (filter) patch.filter = fromDraft(filter) ?? null;
    setBusy(true);
    const ok = await onSave(patch);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Drawer kind="board" title={board.title} testId="board-drawer" onClose={onClose}>
      <label className="field">
        <span className="field-label">title · content/{board.slug}.md</span>
        <input
          className="input input-sans"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="board-title-input"
        />
      </label>
      <label className="field">
        <span className="field-label">description</span>
        <input
          className="input input-sans"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <section className="drawer-section">
        <h4>Cards on this board</h4>
        <p className="help">
          Only cards matching these conditions appear. Columns and swimlanes then sort them into
          cells.
        </p>
        {filter ? (
          <FilterEditor
            draft={filter}
            onChange={setFilter}
            emptyText="No conditions — every item is eligible."
            testId="board-filter-editor"
          />
        ) : (
          <p className="warn">
            This filter uses nested groups (<code>{filterSummary(board.filter)}</code>). Edit it in{' '}
            <code>{board.slug}.md</code>.
          </p>
        )}
      </section>

      <div className="drawer-footer">
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginLeft: 'auto' }}
          disabled={busy}
          onClick={() => void save()}
          data-testid="board-save"
        >
          {busy ? 'saving…' : 'Save'}
        </button>
      </div>
    </Drawer>
  );
}
