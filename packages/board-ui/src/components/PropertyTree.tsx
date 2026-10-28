import React, { useId, useRef, useState } from 'react';
import type { PropertyValue } from '@awesome-markdown/contracts';
import { defaultNode, numericValue, validName } from '../lib/property-tree.js';
import type { ValueNode, ValueType } from '../lib/property-tree.js';

const types: ValueType[] = ['text', 'number', 'boolean', 'group', 'list', 'null'];
const typeOf = (value: PropertyValue): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'list'
      : typeof value === 'object'
        ? 'group'
        : typeof value;

export function PropertyRead({
  value,
  label,
}: {
  value: PropertyValue;
  label: string;
}): React.ReactElement {
  const type = typeOf(value);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return (
      <details className="property-container" open>
        <summary>
          <strong>{label}</strong>{' '}
          <span className="property-type">
            {type} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </summary>
        <div className="property-children">
          {entries.map(([key, child], index) => (
            <PropertyRead
              key={key}
              label={Array.isArray(value) ? `Entry ${index + 1}` : key}
              value={child}
            />
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="property-scalar">
      <strong>{label}</strong>
      <span className="property-type">{type}</span>
      <code>{typeof value === 'string' ? JSON.stringify(value) : String(value)}</code>
    </div>
  );
}

interface TreeProps {
  node: ValueNode;
  label: string;
  root?: boolean;
  change: (id: string, change: (value: ValueNode) => ValueNode) => void;
  pending: (id: string, value: boolean) => void;
  announce: (message: string) => void;
}

function AddValue({ node, label, root, change, pending, announce }: TreeProps): React.ReactElement {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ValueType>('text');
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = (): void => {
    setAdding(false);
    setName('');
    setError('');
    pending(node.id, false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <div className="property-add">
      {!adding ? (
        <button
          ref={trigger}
          type="button"
          onClick={() => {
            setAdding(true);
            pending(node.id, true);
          }}
        >
          Add {node.type === 'list' ? 'entry' : 'property'} to {label}
        </button>
      ) : (
        <div role="group" aria-label={`Add to ${label}`} className="property-add-form">
          <span>Adding to {label}</span>
          {node.type !== 'list' && (
            <label htmlFor={`${id}-name`}>
              Name
              <input
                id={`${id}-name`}
                autoFocus
                value={name}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setError('');
                }}
              />
            </label>
          )}
          <label htmlFor={`${id}-type`}>
            Type
            <select
              id={`${id}-type`}
              autoFocus={node.type === 'list'}
              value={type}
              onChange={(event) => setType(event.target.value as ValueType)}
            >
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                const key = node.type === 'list' ? '' : validName(name, node, Boolean(root));
                change(node.id, (current) => ({
                  ...current,
                  entries: [...current.entries, { key, node: defaultNode(type) }],
                }));
                announce(`Added ${node.type === 'list' ? 'entry' : key} to ${label}.`);
                close();
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
                document.getElementById(`${id}-name`)?.focus();
              }
            }}
          >
            Confirm addition
          </button>
          <button type="button" onClick={close}>
            Cancel addition
          </button>
          {error && (
            <span id={`${id}-error`} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function PropertyEdit(props: TreeProps): React.ReactElement {
  const { node, label, root, change, pending, announce } = props;
  const id = useId();
  const containerRef = useRef<HTMLDetailsElement>(null);
  if (node.type === 'group' || node.type === 'list') {
    const content = (
      <>
        <div className="property-children">
          {node.entries.map((entry, index) => {
            const childLabel = node.type === 'list' ? `Entry ${index + 1}` : entry.key;
            return (
              <div className="property-edit-entry" key={entry.node.id}>
                <PropertyEdit {...props} root={false} node={entry.node} label={childLabel} />
                <button
                  type="button"
                  aria-label={`Remove ${childLabel}`}
                  onClick={(event) => {
                    if (
                      entry.node.entries.length &&
                      !window.confirm(`Remove ${childLabel} and all its contents?`)
                    )
                      return;
                    const group = event.currentTarget.closest('.property-children');
                    change(node.id, (current) => ({
                      ...current,
                      entries: current.entries.filter((child) => child.node.id !== entry.node.id),
                    }));
                    const clearPending = (child: ValueNode): void => {
                      pending(child.id, false);
                      child.entries.forEach((e) => clearPending(e.node));
                    };
                    clearPending(entry.node);
                    announce(`Removed ${childLabel}. Save to persist this change.`);
                    requestAnimationFrame(() =>
                      (
                        group?.parentElement?.querySelector(
                          '.property-add button'
                        ) as HTMLButtonElement | null
                      )?.focus()
                    );
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        <AddValue {...props} />
      </>
    );
    if (root) return <div className="property-root">{content}</div>;
    return (
      <details
        ref={containerRef}
        className="property-container"
        open
        onInvalidCapture={() => {
          if (containerRef.current) containerRef.current.open = true;
        }}
      >
        <summary>
          <strong>{label}</strong>{' '}
          <span className="property-type">
            {node.type} · {node.entries.length} entries
          </span>
        </summary>
        {content}
      </details>
    );
  }
  let numericError = '';
  if (node.type === 'number') {
    try {
      numericValue(node.text);
    } catch (error) {
      numericError = error instanceof Error ? error.message : String(error);
    }
  }
  return (
    <div className="property-field">
      {node.type === 'null' ? (
        <div>
          {label} <span className="property-type">null</span>
        </div>
      ) : (
        <label htmlFor={id}>
          {label} <span className="property-type">{node.type}</span>
        </label>
      )}
      {node.type === 'text' && (
        <textarea
          id={id}
          rows={Math.min(6, Math.max(1, node.text.split('\n').length))}
          value={node.text}
          onChange={(event) => change(node.id, (n) => ({ ...n, text: event.target.value }))}
        />
      )}
      {node.type === 'number' && (
        <>
          <input
            id={id}
            inputMode="decimal"
            value={node.text}
            aria-invalid={Boolean(numericError)}
            aria-describedby={numericError ? `${id}-error` : undefined}
            onChange={(event) => change(node.id, (n) => ({ ...n, text: event.target.value }))}
          />
          {numericError && (
            <span id={`${id}-error`} role="alert">
              {numericError}
            </span>
          )}
        </>
      )}
      {node.type === 'boolean' && (
        <input
          id={id}
          type="checkbox"
          checked={node.checked}
          onChange={(event) => change(node.id, (n) => ({ ...n, checked: event.target.checked }))}
        />
      )}
      {node.type === 'null' && (
        <>
          <span id={id}>null</span>
          <label>
            Replace {label} (null) with
            <select
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return;
                change(node.id, (n) => ({
                  ...defaultNode(event.target.value as ValueType),
                  id: n.id,
                }));
                announce(`Replaced null in ${label}.`);
              }}
            >
              <option value="">Choose type</option>
              {types
                .filter((t) => t !== 'null')
                .map((t) => (
                  <option key={t}>{t}</option>
                ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
