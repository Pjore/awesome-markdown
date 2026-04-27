import React, { useState, useEffect } from 'react';
import type { Item, ItemPriority } from '@awesome-markdown/contracts';
import { ItemPrioritySchema } from '@awesome-markdown/contracts';
import type { CreateItemInput, UpdateItemInput } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Shared form-state type
// ---------------------------------------------------------------------------

interface FormState {
  title: string;
  body: string;
  status: string;
  priority: ItemPriority;
  tags: string;
  dueDate: string;
  assignee: string;
}

function defaultFormState(): FormState {
  return {
    title: '',
    body: '',
    status: 'open',
    priority: 'medium',
    tags: '',
    dueDate: '',
    assignee: '',
  };
}

function itemToFormState(item: Item): FormState {
  return {
    title: item.title,
    body: item.body,
    status: item.status,
    priority: item.priority,
    tags: item.tags.join(', '),
    dueDate: item.dueDate ?? '',
    assignee: item.assignee ?? '',
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type CreateProps = {
  mode: 'create';
  boardId: string;
  columnId: string;
  swimlaneId: string;
  onSave: (input: Omit<CreateItemInput, 'boardId' | 'columnId' | 'swimlaneId'>) => Promise<void>;
  onClose: () => void;
  item?: never;
  onDelete?: never;
};

type EditProps = {
  mode: 'edit';
  item: Item;
  boardId: string;
  columnId: string;
  swimlaneId: string;
  onSave: (patch: UpdateItemInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
};

type ItemEditorProps = CreateProps | EditProps;

const PRIORITIES = ItemPrioritySchema.options;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal editor for creating or editing an Item.
 * Validates with Zod before calling the provider.
 */
export function ItemEditor(props: ItemEditorProps): React.ReactElement {
  const { mode, onClose } = props;

  const [form, setForm] = useState<FormState>(() =>
    mode === 'edit' ? itemToFormState(props.item) : defaultFormState(),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form when item changes in edit mode
  useEffect(() => {
    if (mode === 'edit') {
      setForm(itemToFormState(props.item));
    }
  }, [mode, mode === 'edit' ? props.item : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) next.title = 'Title is required';
    if (!PRIORITIES.includes(form.priority as ItemPriority)) {
      next.priority = `Priority must be one of: ${PRIORITIES.join(', ')}`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function buildPayload(): Omit<CreateItemInput, 'boardId' | 'columnId' | 'swimlaneId'> {
    return {
      title: form.title.trim(),
      body: form.body,
      status: form.status.trim() || 'open',
      priority: form.priority,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      dueDate: form.dueDate.trim() || undefined,
      assignee: form.assignee.trim() || undefined,
      customFields: mode === 'edit' ? props.item.customFields : {},
    };
  }

  const handleSave = async (): Promise<void> => {
    if (!validate()) return;
    setSaving(true);
    try {
      await props.onSave(buildPayload());
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (mode !== 'edit') return;
    setDeleting(true);
    try {
      await props.onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || deleting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="item-editor-modal"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <h2 className="font-semibold text-gray-800">
            {mode === 'create' ? 'New Item' : 'Edit Item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Close editor"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Title */}
          <Field label="Title" error={errors.title} required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              disabled={busy}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              data-testid="editor-title"
              autoFocus
            />
          </Field>

          {/* Body */}
          <Field label="Body (Markdown)">
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              disabled={busy}
              rows={4}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 resize-y"
              data-testid="editor-body"
            />
          </Field>

          {/* Status */}
          <Field label="Status">
            <input
              type="text"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              disabled={busy}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              data-testid="editor-status"
              list="status-suggestions"
            />
            <datalist id="status-suggestions">
              <option value="open" />
              <option value="in-progress" />
              <option value="done" />
              <option value="blocked" />
            </datalist>
          </Field>

          {/* Priority */}
          <Field label="Priority" error={errors.priority}>
            <select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as ItemPriority)}
              disabled={busy}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              data-testid="editor-priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </Field>

          {/* Tags */}
          <Field label="Tags (comma-separated)">
            <input
              type="text"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              disabled={busy}
              placeholder="frontend, bug, v2"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              data-testid="editor-tags"
            />
          </Field>

          {/* Due Date */}
          <Field label="Due Date">
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
              disabled={busy}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              data-testid="editor-due-date"
            />
          </Field>

          {/* Assignee */}
          <Field label="Assignee">
            <input
              type="text"
              value={form.assignee}
              onChange={(e) => set('assignee', e.target.value)}
              disabled={busy}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              data-testid="editor-assignee"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 rounded-b-lg">
          <div>
            {mode === 'edit' && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                data-testid="editor-delete"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              data-testid="editor-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: labeled form field
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  error,
  required,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-0.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}
