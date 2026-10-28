import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ItemSchema, SYSTEM_KEYS, itemLabel } from '@awesome-markdown/contracts';
import type { ItemRecord, Item } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import { useBreadcrumb } from '../breadcrumb.js';
import { useRouterAdapter } from '../router/RouterAdapter.js';
import { useProviderSubscribe } from '../state/useProviderSubscribe.js';
import { PropertyRead, PropertyEdit } from '../components/PropertyTree.js';
import { ItemRecovery } from '../components/ItemRecovery.js';
import {
  draftItem,
  draftMutations,
  propertiesNode,
  protectedRoot,
  updateNode,
} from '../lib/property-tree.js';
import type { ValueNode } from '../lib/property-tree.js';

export function ItemEditorPage(): React.ReactElement {
  const router = useRouterAdapter();
  const { slug } = router.useParams();
  const board = router.useSearchParams().get('board');
  const provider = useProvider();
  const { setSegments } = useBreadcrumb();
  const [record, setRecord] = useState<ItemRecord | null>(null);
  const [tree, setTree] = useState<ValueNode | null>(null);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [incoming, setIncoming] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const activeEdit = useRef(false);
  activeEdit.current = editing;
  const generation = useRef(0);
  const backPath = board ? `/boards/${encodeURIComponent(board)}` : '/';

  const accept = (fetched: ItemRecord): void => {
    setRecord(fetched);
    setTree(propertiesNode(fetched.item));
    setBody(fetched.item.body ?? '');
    setPending(new Set());
    setIncoming(false);
    setError('');
  };
  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setRecord(null);
    setEditing(false);
    setError('');
    void provider
      .getItem(slug ?? '')
      .then((fetched) => {
        if (request !== generation.current) return;
        if (!fetched) {
          setError(`Item "${slug}" not found.`);
          return;
        }
        accept(fetched);
      })
      .catch((reason) => {
        if (request === generation.current) setError(String(reason));
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      ++generation.current;
    };
  }, [slug, provider]);

  useProviderSubscribe((event) => {
    if (!slug || (event?.type === 'change' && event.entitySlug !== slug)) return;
    if (activeEdit.current) {
      setIncoming(true);
      return;
    }
    const request = generation.current;
    void provider
      .getItem(slug)
      .then((fetched) => {
        if (request !== generation.current || activeEdit.current) return;
        if (fetched) accept(fetched);
        else setError('Item was deleted.');
      })
      .catch((reason) => setError(String(reason)));
  });

  useEffect(() => {
    setSegments(
      board
        ? [{ label: 'boards', to: '/' }, { label: board, to: backPath }, { label: slug ?? '' }]
        : [{ label: 'items', to: '/' }, { label: slug ?? '' }]
    );
    return () => setSegments([]);
  }, [slug, board, backPath, setSegments]);

  let draft: Item | null = record?.item ?? null;
  let invalid = '';
  if (editing && record && tree) {
    try {
      draft = draftItem(record.item, tree, body);
      ItemSchema.parse(draft);
    } catch (reason) {
      draft = null;
      invalid = reason instanceof Error ? reason.message : String(reason);
    }
  }
  const dirty =
    editing &&
    (Boolean(invalid) ||
      pending.size > 0 ||
      JSON.stringify(draft) !== JSON.stringify(record?.item));
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        target?.hasAttribute('download') ||
        target?.getAttribute('target') === '_blank' ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (target && !window.confirm('Discard unsaved item changes and leave?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);

  const cancel = (): void => {
    if (dirty && !window.confirm('Discard all changes, including incomplete input?')) return;
    if (record) accept(record);
    setEditing(false);
    setMessage('Changes discarded.');
    requestAnimationFrame(() => editButton.current?.focus());
  };
  const save = async (): Promise<void> => {
    if (!record || !draft || invalid || pending.size) {
      setError(invalid || 'Confirm or cancel the pending addition before saving.');
      const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      let parent = field?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      field?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const mutations = draftMutations(record.item, draft);
      const saved = mutations.length
        ? await provider.patchItem(record.item.slug, { revision: record.revision, mutations })
        : await provider.getItem(record.item.slug);
      if (!saved) throw new Error('Item was deleted; export the draft for recovery.');
      if (!mutations.length && saved.revision !== record.revision)
        throw new Error(
          'Conflict: the source changed after entering Edit. Reload after discarding the snapshot.'
        );
      accept(saved);
      setEditing(false);
      setIncoming(false);
      setMessage('Item saved.');
      requestAnimationFrame(() => editButton.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };
  const reload = async (): Promise<void> => {
    if (editing && !window.confirm('Discard the edit snapshot and reload the current source?'))
      return;
    try {
      const fetched = await provider.getItem(slug ?? '');
      if (!fetched) throw new Error('Item was deleted; export your draft for recovery.');
      accept(fetched);
      setEditing(false);
      setMessage('Current source loaded.');
    } catch (reason) {
      setError(String(reason));
    }
  };

  if (loading)
    return (
      <p className="item-page" data-testid="item-editor-loading">
        Loading item…
      </p>
    );
  if (!record || !tree)
    return (
      <div className="item-page" data-testid="item-editor-error">
        <p role="alert">{error}</p>
        <button onClick={() => router.navigate(backPath)}>Back</button>
      </div>
    );
  return (
    <article
      className="item-page"
      data-testid="item-editor"
      onKeyDown={(event) => {
        if (editing && (event.metaKey || event.ctrlKey) && event.key === 's') {
          event.preventDefault();
          void save();
        }
        if (editing && event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <header className="item-heading">
        <div>
          <p className="item-slug">{record.item.slug}</p>
          <h1>{itemLabel(record.item)}</h1>
        </div>
        {!editing && (
          <button
            type="button"
            ref={editButton}
            data-testid="item-edit"
            onClick={() => {
              accept(record);
              setEditing(true);
              setMessage('Editing item. Changes are saved only with Save.');
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('[data-testid="item-editor-body"]')?.focus()
              );
            }}
          >
            Edit
          </button>
        )}
      </header>
      <p role="status" aria-live="polite" className="item-status">
        {message}
      </p>
      {incoming && (
        <p role="status">
          The source may have changed. Your edit snapshot is preserved; saving will check its
          revision.
        </p>
      )}
      {error && (
        <div role="alert" data-testid="item-editor-save-error">
          <p>{error}</p>
          <button type="button" disabled={saving} onClick={() => void reload()}>
            Reload source
          </button>
        </div>
      )}
      <fieldset disabled={saving} className="item-session">
        <section className="item-document" aria-label="Item content">
          {editing ? (
            <textarea
              aria-label="Document text"
              data-testid="item-editor-body"
              rows={12}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          ) : (
            <div data-testid="item-document">
              <ReactMarkdown>{record.item.body ?? ''}</ReactMarkdown>
            </div>
          )}
        </section>
        <section aria-labelledby="properties-heading">
          <h2 id="properties-heading">Properties</h2>
          {editing ? (
            <PropertyEdit
              node={tree}
              label="Properties"
              root
              change={(id, change) =>
                setTree((current) => (current ? updateNode(current, id, change) : current))
              }
              pending={(id, open) =>
                setPending((previous) => {
                  const next = new Set(previous);
                  if (open) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
              announce={setMessage}
            />
          ) : (
            <div data-testid="item-properties">
              {Object.entries(record.item)
                .filter(([key]) => !protectedRoot(key))
                .map(([key, value]) => (
                  <PropertyRead key={key} label={key} value={value} />
                ))}
            </div>
          )}
        </section>
        <details className="item-metadata">
          <summary>System metadata · read-only</summary>
          {SYSTEM_KEYS.map((key) => (
            <PropertyRead key={key} label={key} value={record.item[key]} />
          ))}
        </details>
        {editing && (
          <div className="item-actions">
            <button type="button" data-testid="item-save" onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        )}
      </fieldset>
      <ItemRecovery
        item={draft}
        invalid={invalid || (pending.size ? 'Confirm or cancel the pending addition.' : '')}
        announce={setMessage}
      />
      {!editing && (
        <footer className="item-actions">
          <button type="button" data-testid="item-back" onClick={() => router.navigate(backPath)}>
            Back{board ? ' to board' : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Permanently delete ${itemLabel(record.item)}?`)) return;
              setSaving(true);
              void provider.deleteItem(record.item.slug).then(
                () => router.navigate(backPath),
                (reason) => {
                  setError(String(reason));
                  setSaving(false);
                }
              );
            }}
          >
            Delete item
          </button>
        </footer>
      )}
    </article>
  );
}
