import { describe, it, expect, vi } from 'vitest';
import { SidecarHttpClient, ProviderHttpError } from '../src/http-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchArgs = [string | URL | Request, RequestInit | undefined];

function makeFetch(status: number, body: unknown): [ReturnType<typeof vi.fn>, FetchArgs[]] {
  const calls: FetchArgs[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return [fn, calls];
}

function makeClient(fetchFn: ReturnType<typeof vi.fn>): SidecarHttpClient {
  return new SidecarHttpClient({
    baseUrl: 'http://localhost:7701',
    fetchFn: fetchFn as typeof fetch,
  });
}

const NOW = '2024-01-01T00:00:00.000Z';

const board = {
  entityType: 'board' as const,
  slug: 'demo', title: 'Demo',
  createdAt: NOW, updatedAt: NOW,
};

const axis = {
  entityType: 'axis' as const,
  slug: 'todo', title: 'To Do',
  createdAt: NOW, updatedAt: NOW,
};

const item = {
  entityType: 'item' as const,
  slug: 'task-1', title: 'Task 1',
  createdAt: NOW, updatedAt: NOW,
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — health', () => {
  it('resolves on 200', async () => {
    const [fetch] = makeFetch(200, { ok: true });
    await expect(makeClient(fetch).health()).resolves.toBeUndefined();
  });

  it('throws ProviderHttpError on non-2xx', async () => {
    const [fetch] = makeFetch(503, { error: 'down' });
    await expect(makeClient(fetch).health()).rejects.toBeInstanceOf(ProviderHttpError);
  });
});

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — listBoards', () => {
  it('GET /boards and returns Board[]', async () => {
    const [fetch, calls] = makeFetch(200, [board]);
    const result = await makeClient(fetch).listBoards();
    expect(result).toEqual([board]);
    expect(String(calls[0]![0])).toBe('http://localhost:7701/boards');
    expect(calls[0]![1]?.method).toBe('GET');
  });

  it('throws on schema mismatch', async () => {
    const [fetch] = makeFetch(200, [{ bad: true }]);
    await expect(makeClient(fetch).listBoards()).rejects.toThrow();
  });
});

describe('SidecarHttpClient — getBoard', () => {
  it('GET /boards/:slug and returns Board', async () => {
    const [fetch, calls] = makeFetch(200, board);
    const result = await makeClient(fetch).getBoard('demo');
    expect(result).toEqual(board);
    expect(String(calls[0]![0])).toBe('http://localhost:7701/boards/demo');
  });

  it('returns null on 404', async () => {
    const [fetch] = makeFetch(404, { error: 'not found' });
    expect(await makeClient(fetch).getBoard('missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — listAxes', () => {
  it('GET /axes and returns Axis[]', async () => {
    const [fetch, calls] = makeFetch(200, [axis]);
    const result = await makeClient(fetch).listAxes();
    expect(result).toEqual([axis]);
    expect(String(calls[0]![0])).toBe('http://localhost:7701/axes');
  });
});

describe('SidecarHttpClient — getAxis', () => {
  it('GET /axes/:slug and returns Axis', async () => {
    const [fetch] = makeFetch(200, axis);
    expect(await makeClient(fetch).getAxis('todo')).toEqual(axis);
  });

  it('returns null on 404', async () => {
    const [fetch] = makeFetch(404, { error: 'not found' });
    expect(await makeClient(fetch).getAxis('missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Render / Homeless
// ---------------------------------------------------------------------------

const render = {
  board,
  axes: { columns: [axis], swimlanes: [] },
  cells: [{ columnSlug: 'todo', swimlaneSlug: 'default', readOnly: false, items: [item] }],
};

const homeless = { board, items: [item] };

describe('SidecarHttpClient — getBoardRender', () => {
  it('GET /boards/:slug/render and returns BoardRender', async () => {
    const [fetch, calls] = makeFetch(200, render);
    const result = await makeClient(fetch).getBoardRender('demo');
    expect(result.board.slug).toBe('demo');
    expect(String(calls[0]![0])).toBe('http://localhost:7701/boards/demo/render');
  });

  it('throws on schema mismatch', async () => {
    const [fetch] = makeFetch(200, { bad: true });
    await expect(makeClient(fetch).getBoardRender('demo')).rejects.toThrow();
  });
});

describe('SidecarHttpClient — getHomeless', () => {
  it('GET /boards/:slug/homeless and returns Homeless', async () => {
    const [fetch, calls] = makeFetch(200, homeless);
    const result = await makeClient(fetch).getHomeless('demo');
    expect(result.board.slug).toBe('demo');
    expect(String(calls[0]![0])).toBe('http://localhost:7701/boards/demo/homeless');
  });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — getItem', () => {
  it('GET /items/:slug and returns Item', async () => {
    const [fetch, calls] = makeFetch(200, item);
    const result = await makeClient(fetch).getItem('task-1');
    expect(result).toEqual(item);
    expect(String(calls[0]![0])).toBe('http://localhost:7701/items/task-1');
  });

  it('returns null on 404', async () => {
    const [fetch] = makeFetch(404, { error: 'not found' });
    expect(await makeClient(fetch).getItem('missing')).toBeNull();
  });
});

describe('SidecarHttpClient — createItem', () => {
  it('POST /items with body and returns Item', async () => {
    const [fetch, calls] = makeFetch(201, item);
    const req = { slug: 'task-1', title: 'Task 1', mutations: [] };
    const result = await makeClient(fetch).createItem(req);
    expect(result).toEqual(item);
    expect(String(calls[0]![0])).toBe('http://localhost:7701/items');
    expect(calls[0]![1]?.method).toBe('POST');
    expect(JSON.parse(calls[0]![1]?.body as string)).toMatchObject({ slug: 'task-1' });
  });
});

describe('SidecarHttpClient — patchItem', () => {
  it('PATCH /items/:slug with mutations and returns Item', async () => {
    const [fetch, calls] = makeFetch(200, item);
    const result = await makeClient(fetch).patchItem('task-1', {
      mutations: [{ op: 'set', path: 'status', value: 'done' }],
    });
    expect(result).toEqual(item);
    expect(String(calls[0]![0])).toBe('http://localhost:7701/items/task-1');
    expect(calls[0]![1]?.method).toBe('PATCH');
  });
});

describe('SidecarHttpClient — deleteItem', () => {
  it('DELETE /items/:slug', async () => {
    const [fetch, calls] = makeFetch(200, { ok: true });
    await expect(makeClient(fetch).deleteItem('task-1')).resolves.toBeUndefined();
    expect(String(calls[0]![0])).toBe('http://localhost:7701/items/task-1');
    expect(calls[0]![1]?.method).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — error handling', () => {
  it('throws ProviderHttpError with status and message on non-2xx', async () => {
    const [fetch] = makeFetch(500, { error: 'internal error' });
    try {
      await makeClient(fetch).listBoards();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderHttpError);
      expect((err as ProviderHttpError).status).toBe(500);
      expect((err as ProviderHttpError).message).toBe('internal error');
    }
  });
});
