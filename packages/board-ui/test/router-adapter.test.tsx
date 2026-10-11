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
function fakeAdapter(params: Record<string, string>, search = ''): RouterAdapter & {
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
      </RouterAdapterProvider>,
    );
  });
  // let provider promises + effects settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const q = (testId: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testId}"]`);

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

  it('src/ never imports a router package directly', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/from ['"]react-router|from ['"]@tanstack\/react-router/.test(readFileSync(full, 'utf8')))
          offenders.push(full);
      }
    };
    walk(resolve(__dirname, '../src'));
    expect(offenders).toEqual([]);
  });
});
