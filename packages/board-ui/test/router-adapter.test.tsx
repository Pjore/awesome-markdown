import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LocalStorageProvider } from '@awesome-markdown/provider-localstorage';
import {
  BoardListPage,
  BoardPage,
  ItemEditorPage,
  ProviderContextProvider,
  RouterAdapterProvider,
} from '../src/index.js';
import type { RouterAdapter, RouterLinkProps } from '../src/index.js';

// React 19 only flushes act() warnings-free when this flag is set.
(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

/** Minimal in-memory host router: records navigations, prefixes hrefs like a nested host would. */
function fakeAdapter(
  params: Record<string, string>,
  search = ''
): RouterAdapter & {
  navigate: ReturnType<typeof vi.fn>;
} {
  const navigate = vi.fn();
  function Link({ to, children, ...rest }: RouterLinkProps): React.ReactElement {
    return (
      <a href={`/w/acme${to}`} {...rest}>
        {children}
      </a>
    );
  }
  return {
    Link,
    navigate,
    useParams: () => params,
    useSearchParams: () => new URLSearchParams(search),
  };
}

let container: HTMLDivElement;
let root: Root;
let provider: LocalStorageProvider;

beforeEach(() => {
  localStorage.clear();
  provider = new LocalStorageProvider();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount(adapter: RouterAdapter, page: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(
      <RouterAdapterProvider adapter={adapter}>
        <ProviderContextProvider provider={provider}>{page}</ProviderContextProvider>
      </RouterAdapterProvider>
    );
  });
  // let provider promises + effects settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const q = (testId: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testId}"]`);

async function click(testId: string): Promise<void> {
  await act(async () => q(testId)?.click());
}

async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('board-ui RouterAdapter seam', () => {
  it('BoardListPage renders board links through the host Link', async () => {
    await provider.createBoard({ slug: 'board-dev', title: 'Dev' });
    await mount(fakeAdapter({}), <BoardListPage />);

    const link = q('board-link-board-dev');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/w/acme/boards/board-dev');
    expect(q('board-title-board-dev')?.textContent).toBe('Dev');
  });

  it('BoardPage reads the slug from adapter.useParams', async () => {
    await provider.createBoard({ slug: 'board-dev', title: 'Dev' });
    await mount(fakeAdapter({ slug: 'board-dev' }), <BoardPage />);
    expect(q('board-page')).not.toBeNull();
    expect(q('board-not-found')).toBeNull();
  });

  it('BoardPage falls back to a host-routed back link for unknown boards', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // expected load failure
    await mount(fakeAdapter({ slug: 'missing' }), <BoardPage />);
    expect(q('board-not-found')).not.toBeNull();
    expect(q('back-to-list')?.getAttribute('href')).toBe('/w/acme/');
  });

  it('ItemEditorPage reads ?board= via adapter.useSearchParams and navigates back', async () => {
    await provider.createBoard({ slug: 'board-dev', title: 'Dev' });
    await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    const adapter = fakeAdapter({ slug: 'task-1' }, 'board=board-dev');
    await mount(adapter, <ItemEditorPage />);

    const cancel = container.querySelector<HTMLButtonElement>('[data-testid="item-editor-cancel"]');
    expect(cancel).not.toBeNull();
    await act(async () => cancel?.click());
    expect(adapter.navigate).toHaveBeenCalledWith('/boards/board-dev');
  });

  it('edits full frontmatter, preserves the body, and saves through the provider', async () => {
    await provider.createItem({
      slug: 'task-1',
      title: 'Task 1',
      body: 'Keep this body',
      mutations: [{ op: 'set', path: 'obsolete', value: true }],
    });
    const adapter = fakeAdapter({ slug: 'task-1' });
    await mount(adapter, <ItemEditorPage />);
    await click('item-editor-frontmatter-toggle');
    const raw = q('item-editor-frontmatter') as HTMLTextAreaElement;
    await fill(
      raw,
      raw.value.replace('title: Task 1', 'title: Updated').replace('obsolete: true', '') +
        '\ntags: [one, two]\ncustom: {nested: [1, false, null]}\nboards:\n  - board: dev\n    assignee: alice\n    note: keep'
    );
    await click('item-editor-save');
    expect(adapter.navigate).toHaveBeenCalledWith('/');
    const saved = await provider.getItem('task-1');
    expect(saved).toMatchObject({
      title: 'Updated',
      body: 'Keep this body',
      tags: ['one', 'two'],
      custom: { nested: [1, false, null] },
      boards: [{ board: 'dev', assignee: 'alice', note: 'keep' }],
    });
    expect(saved).not.toHaveProperty('obsolete');
  });

  it('keeps form and YAML edits in sync across mode switches', async () => {
    await provider.createBoard({ slug: 'board-dev', title: 'Dev' });
    await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    await mount(fakeAdapter({ slug: 'task-1' }, 'board=board-dev'), <ItemEditorPage />);
    await fill(q('item-editor-title') as HTMLInputElement, 'Form title');
    await click('item-editor-frontmatter-toggle');
    const raw = q('item-editor-frontmatter') as HTMLTextAreaElement;
    expect(raw.value).toContain('title: Form title');
    await fill(
      raw,
      raw.value.replace('title: Form title', 'title: YAML title') +
        '\ncustom: {keep: true}\nboards:\n  - board: board-dev\n    assignee: alice\n    note: keep'
    );
    await click('item-editor-frontmatter-toggle');
    expect((q('item-editor-title') as HTMLInputElement).value).toBe('YAML title');
    expect((q('item-editor-assignee') as HTMLInputElement).value).toBe('alice');
    await fill(q('item-editor-assignee') as HTMLInputElement, 'bob');
    await fill(q('item-editor-title') as HTMLInputElement, 'Final title');
    await click('item-editor-save');
    expect(await provider.getItem('task-1')).toMatchObject({
      title: 'Final title',
      custom: { keep: true },
      boards: [{ board: 'board-dev', assignee: 'bob', note: 'keep' }],
    });
  });

  it('blocks invalid YAML on save and mode switch without losing the draft', async () => {
    await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    const patch = vi.spyOn(provider, 'patchItem');
    const adapter = fakeAdapter({ slug: 'task-1' });
    await mount(adapter, <ItemEditorPage />);
    await click('item-editor-frontmatter-toggle');
    const raw = q('item-editor-frontmatter') as HTMLTextAreaElement;
    const valid = raw.value;
    await fill(raw, 'broken: [');
    await click('item-editor-save');
    expect(q('item-editor-save-error')).not.toBeNull();
    expect(patch).not.toHaveBeenCalled();
    expect(adapter.navigate).not.toHaveBeenCalled();
    await click('item-editor-frontmatter-toggle');
    expect(raw.value).toBe('broken: [');
    expect(q('item-editor-title')).toBeNull();
    await fill(raw, valid + '\nstatus: done');
    await click('item-editor-save');
    expect((await provider.getItem('task-1'))?.status).toBe('done');
  });

  it('refreshes pristine raw metadata on provider events but protects dirty YAML', async () => {
    await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    await mount(fakeAdapter({ slug: 'task-1' }), <ItemEditorPage />);
    await click('item-editor-frontmatter-toggle');
    await act(async () => {
      await provider.patchItem('task-1', {
        mutations: [{ op: 'set', path: 'status', value: 'doing' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const raw = q('item-editor-frontmatter') as HTMLTextAreaElement;
    expect(raw.value).toContain('status: doing');
    await fill(raw, raw.value.replace('status: doing', 'status: done'));
    await act(async () => {
      await provider.patchItem('task-1', {
        mutations: [{ op: 'set', path: 'status', value: 'todo' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(raw.value).toContain('status: done');
  });

  it('cancel discards raw edits and save failures retain the draft for retry', async () => {
    await provider.createItem({ slug: 'task-1', title: 'Task 1', mutations: [] });
    const adapter = fakeAdapter({ slug: 'task-1' });
    await mount(adapter, <ItemEditorPage />);
    await click('item-editor-frontmatter-toggle');
    const raw = q('item-editor-frontmatter') as HTMLTextAreaElement;
    await fill(raw, raw.value + '\nstatus: done');
    vi.spyOn(provider, 'patchItem').mockRejectedValueOnce(new Error('Offline'));
    await click('item-editor-save');
    expect(q('item-editor-save-error')?.textContent).toBe('Offline');
    expect(raw.value).toContain('status: done');
    expect(adapter.navigate).not.toHaveBeenCalled();
    await click('item-editor-cancel');
    expect(adapter.navigate).toHaveBeenCalledWith('/');
    expect((await provider.getItem('task-1'))?.status).toBeUndefined();
  });

  it('src/ never imports a router package directly', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /from ['"]react-router|from ['"]@tanstack\/react-router/.test(readFileSync(full, 'utf8'))
        )
          offenders.push(full);
      }
    };
    walk(resolve(__dirname, '../src'));
    expect(offenders).toEqual([]);
  });
});
