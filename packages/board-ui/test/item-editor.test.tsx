import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalStorageProvider } from '@awesome-markdown/provider-localstorage';
import type { Item } from '@awesome-markdown/contracts';
import { ItemEditorPage, ProviderContextProvider, RouterAdapterProvider } from '../src/index.js';
import type { RouterAdapter } from '../src/index.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let provider: LocalStorageProvider;
let navigate: ReturnType<typeof vi.fn>;
const initial: Item = {
  entityType: 'item',
  slug: 'fixture',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  body: 'Original document',
  number: 3,
  text: '003',
  mixed: [1, 2, { createdAt: 'editable', 'a.b': false }],
  nil: null,
  empty: '',
  group: {},
};
const buttons = (text: string): HTMLButtonElement[] =>
  [...host.querySelectorAll('button')].filter((button) => button.textContent === text);
const button = (text: string): HTMLButtonElement => {
  const result = buttons(text)[0];
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
};
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  for (let attempt = 0; host.querySelector('fieldset')?.disabled && attempt < 50; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}
async function input(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<void> {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  const accessible = [
    ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'),
  ].find((element) => element.getAttribute('aria-label') === label);
  if (accessible) return accessible;
  const match = [...host.querySelectorAll('label')].find((element) =>
    element.textContent?.trim().startsWith(label)
  );
  const id = match?.getAttribute('for');
  const result = id ? document.getElementById(id) : match?.querySelector('input,textarea');
  if (!result) throw new Error(`Missing field ${label}`);
  return result as HTMLInputElement;
}
async function mount(item = initial): Promise<void> {
  localStorage.setItem('awesome-markdown:v2', JSON.stringify({ 'item:fixture': item }));
  const adapter: RouterAdapter = {
    navigate,
    useParams: () => ({ slug: 'fixture' }),
    useSearchParams: () => new URLSearchParams('board=origin'),
    Link: ({ children }) => <>{children}</>,
  };
  await act(async () => {
    root.render(
      <RouterAdapterProvider adapter={adapter}>
        <ProviderContextProvider provider={provider}>
          <ItemEditorPage />
        </ProviderContextProvider>
      </RouterAdapterProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
beforeEach(() => {
  localStorage.clear();
  provider = new LocalStorageProvider();
  navigate = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('read-first recursive item editor', () => {
  it('renders actual types and metadata-only title fallback without edit controls', async () => {
    await mount();
    expect(host.querySelector('h1')?.textContent).toBe('fixture');
    expect(host.querySelector('textarea,input,select')).toBeNull();
    expect(host.textContent).toContain('"003"');
    expect(host.textContent).toContain('null');
    expect(host.textContent).toContain('Entry 3');
    expect(host.textContent).toContain('System metadata');
    await click(button('Back to board'));
    expect(navigate).toHaveBeenCalledWith('/boards/origin');
  });
  it('puts unchanged user Markdown first without adding a document heading or visible editor label', async () => {
    const body = '# Markdown document\n\nUser content must stay intact.\n';
    await mount({ ...initial, body });
    const session = host.querySelector('.item-session')!;
    expect(session.firstElementChild?.className).toBe('item-document');
    expect(host.querySelectorAll('.item-document h1')).toHaveLength(1);
    expect(host.querySelector('#document-heading')).toBeNull();
    expect(host.querySelector('.item-document')?.textContent).toContain(
      'User content must stay intact.'
    );
    await click(button('Edit'));
    expect(field('Document text').value).toBe(body);
    expect(host.querySelector('.item-document label')).toBeNull();
    await input(field('text'), 'Changed property');
    await click(button('Save'));
    expect((await provider.getItem('fixture'))?.item.body).toBe(body);
  });
  it('shows conventional YAML keys in a YAML code block, excluding document text', async () => {
    await mount();
    const code = host.querySelector('[data-testid=yaml-preview] > code.language-yaml');
    expect(code?.textContent).toContain('entityType: "item"');
    expect(code?.textContent).toContain('mixed:\n  - 1');
    expect(code?.textContent).not.toContain('"entityType":');
    expect(code?.textContent).not.toContain('Original document');
  });
  it('edits properties and document in one explicit save; stays on the read view', async () => {
    await mount();
    await click(button('Edit'));
    await input(field('text'), 'Changed');
    await input(field('Document text'), 'Changed document');
    expect((await provider.getItem('fixture'))?.item.text).toBe('003');
    await click(button('Save'));
    const saved = await provider.getItem('fixture');
    expect(saved?.item.text).toBe('Changed');
    expect(saved?.item.body).toBe('Changed document');
    expect(host.querySelector('textarea')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Item saved.');
  });
  it('cancel confirms dirty input and restores the exact entry snapshot', async () => {
    await mount();
    const before = await provider.getItem('fixture');
    await click(button('Edit'));
    await input(field('number'), '-');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click(button('Cancel'));
    expect(host.querySelector('[aria-invalid=true]')).not.toBeNull();
    await click(button('Cancel'));
    expect(window.confirm).toHaveBeenCalled();
    expect(await provider.getItem('fixture')).toEqual(before);
    expect(host.querySelector('input')).toBeNull();
    await click(button('Edit'));
    expect(field('number').value).toBe('3');
  });
  it('preserves invalid numbers across unrelated edits, blocks exports, clears on removal', async () => {
    await mount();
    await click(button('Edit'));
    await input(field('number'), '1e');
    await input(field('text'), 'Unrelated');
    expect(field('number').value).toBe('1e');
    expect(button('Download YAML').disabled).toBe(true);
    expect(host.querySelector('[data-testid=yaml-preview]')).toBeNull();
    await click(button('Save'));
    expect((await provider.getItem('fixture'))?.item.text).toBe('003');
    const remove = host.querySelector<HTMLButtonElement>('[aria-label="Remove number"]')!;
    await click(remove);
    expect(button('Download YAML').disabled).toBe(false);
    await click(button('Save'));
    expect((await provider.getItem('fixture'))?.item).not.toHaveProperty('number');
  });
  it('list reindexing retains numeric input and disclosure state for the same entry', async () => {
    await mount();
    await click(button('Edit'));
    const mixed = [...host.querySelectorAll('details')].find((element) =>
      element.querySelector('summary')?.textContent?.startsWith('mixed')
    )!;
    const number = [...mixed.querySelectorAll<HTMLInputElement>('input')][1]!;
    await input(number, '-');
    const nested = [...mixed.querySelectorAll('details')][0]!;
    nested.open = false;
    await click(mixed.querySelector<HTMLButtonElement>('[aria-label="Remove Entry 1"]')!);
    expect([...mixed.querySelectorAll<HTMLInputElement>('input')][0]!.value).toBe('-');
    expect(mixed.querySelector('details')?.open).toBe(false);
    await click(mixed.querySelector<HTMLButtonElement>('[aria-label="Remove Entry 1"]')!);
    expect(button('Download YAML').disabled).toBe(false);
  });
  it('add is confirmed, names are validated, cancellation is non-mutating and focus returns', async () => {
    await mount();
    await click(button('Edit'));
    const add = button('Add property to Properties');
    await click(add);
    expect(button('Download YAML').disabled).toBe(true);
    await input(field('Name'), 'constructor');
    await click(button('Confirm addition'));
    expect(host.textContent).toContain('safe property name');
    await input(field('Name'), 'text');
    await click(button('Confirm addition'));
    expect(host.textContent).toContain('already exists');
    await input(field('Name'), '  new.property  ');
    await click(button('Confirm addition'));
    expect(field('new.property').value).toBe('');
    await click(button('Save'));
    expect((await provider.getItem('fixture'))?.item['new.property']).toBe('');
  });
  it('confirms nonempty container deletion but removes empty containers immediately', async () => {
    await mount();
    await click(button('Edit'));
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Remove group"]')!);
    expect(window.confirm).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Remove mixed"]')!);
    expect(host.querySelector('[aria-label="Remove mixed"]')).not.toBeNull();
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Remove mixed"]')!);
    expect(host.querySelector('[aria-label="Remove mixed"]')).toBeNull();
  });
  it('preserves active snapshot on incoming events and retains draft after a stale save', async () => {
    await mount();
    await click(button('Edit'));
    await input(field('text'), 'My draft');
    const before = (await provider.getItem('fixture'))!;
    await act(async () => {
      await provider.patchItem('fixture', {
        revision: before.revision,
        mutations: [{ op: 'set', path: ['text'], value: 'External' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 130));
    });
    expect(field('text').value).toBe('My draft');
    await click(button('Save'));
    expect(field('text').value).toBe('My draft');
    expect(host.textContent).toContain('Conflict');
    expect((await provider.getItem('fixture'))?.item.text).toBe('External');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click(button('Reload source'));
    expect(field('text').value).toBe('My draft');
    await click(button('Reload source'));
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.textContent).toContain('External');
  });
  it('checks the revision even if the user has not changed a field yet', async () => {
    await mount();
    await click(button('Edit'));
    const before = (await provider.getItem('fixture'))!;
    await act(async () => {
      await provider.patchItem('fixture', {
        revision: before.revision,
        mutations: [{ op: 'set', path: ['text'], value: 'External before typing' }],
      });
    });
    await click(button('Save'));
    expect(field('text').value).toBe('003');
    expect(host.textContent).toContain('Conflict');
    expect((await provider.getItem('fixture'))?.item.text).toBe('External before typing');
  });

  it('reports clipboard and download failures without marking the draft saved', async () => {
    await mount();
    await click(button('Edit'));
    await input(field('text'), 'Draft');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
    });
    await click(button('Copy YAML'));
    expect(host.textContent).toContain('Copy failed');
    await click(button('Download Markdown'));
    expect(host.textContent).toContain('Download failed');
    expect(field('text').value).toBe('Draft');
  });
  it('does not treat draft downloads as unsaved navigation', async () => {
    await mount();
    await click(button('Edit'));
    await input(field('text'), 'Recovery draft');
    const oldCreate = URL.createObjectURL;
    const oldRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:recovery');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      this.addEventListener('click', (event) => event.preventDefault(), { once: true });
      this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    try {
      await click(button('Download Markdown'));
      expect(window.confirm).not.toHaveBeenCalled();
      expect(host.textContent).toContain('Downloaded full Markdown draft');
      expect(field('text').value).toBe('Recovery draft');
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } finally {
      URL.createObjectURL = oldCreate;
      URL.revokeObjectURL = oldRevoke;
    }
  });

  it('retains the complete draft on storage failure', async () => {
    await mount();
    await click(button('Edit'));
    await input(field('text'), 'Draft');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    await click(button('Save'));
    expect(field('text').value).toBe('Draft');
    expect(host.textContent).toContain('Storage full');
    expect((await provider.getItem('fixture'))?.item.text).toBe('003');
  });
});
