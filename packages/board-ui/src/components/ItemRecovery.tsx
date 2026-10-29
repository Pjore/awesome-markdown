import React, { useState } from 'react';
import { itemYaml, itemMarkdown } from '@awesome-markdown/contracts';
import type { Item } from '@awesome-markdown/contracts';

export function recoveryFilename(slug: string, extension: string): string {
  const safe = slug.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'item'}.${extension}`;
}
export function ItemRecovery({
  item,
  invalid,
  announce,
}: {
  item: Item | null;
  invalid: string;
  announce: (message: string) => void;
}): React.ReactElement {
  const [error, setError] = useState('');
  const yaml = item && !invalid ? itemYaml(item) : '';
  const download = (extension: 'yaml' | 'md'): void => {
    if (!item || invalid) return;
    let url = '';
    try {
      url = URL.createObjectURL(
        new Blob([extension === 'yaml' ? yaml : itemMarkdown(item)], {
          type: 'text/plain;charset=utf-8',
        })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = recoveryFilename(item.slug, extension);
      document.body.append(link);
      link.click();
      link.remove();
      announce(
        `Downloaded ${extension === 'yaml' ? 'YAML properties' : 'full Markdown draft'}. This does not save the item.`
      );
    } catch (reason) {
      setError(`Download failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  return (
    <details className="item-recovery">
      <summary>YAML preview and recovery</summary>
      {invalid ? (
        <p role="status">
          {invalid} Complete or remove invalid input before previewing or exporting.
        </p>
      ) : (
        <pre data-testid="yaml-preview" aria-label="YAML properties">
          <code className="language-yaml">{yaml}</code>
        </pre>
      )}
      <div className="item-actions">
        <button
          type="button"
          disabled={Boolean(invalid) || !item}
          onClick={() => {
            setError('');
            void (async () => {
              try {
                await navigator.clipboard.writeText(yaml);
                announce('Copied YAML properties. Document text is excluded.');
              } catch (reason) {
                setError(`Copy failed: ${String(reason)}`);
              }
            })();
          }}
        >
          Copy YAML
        </button>
        <button type="button" disabled={Boolean(invalid) || !item} onClick={() => download('yaml')}>
          Download YAML
        </button>
        <button type="button" disabled={Boolean(invalid) || !item} onClick={() => download('md')}>
          Download Markdown
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
