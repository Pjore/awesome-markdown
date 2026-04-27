import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    baseUrl: 'http://localhost:3001',
    fetchFn: fetchFn as typeof fetch,
  });
}

// ---------------------------------------------------------------------------
// Board CRUD
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — boards', () => {
  const board = {
    id: 'b1',
    slug: 'main',
    title: 'Main',
    description: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('listBoards: GET /boards and returns boards array', async () => {
    const [fetch] = makeFetch(200, { boards: [board] });
    const client = makeClient(fetch);
    const result = await client.listBoards();
    expect(result).toEqual([board]);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('listBoards: rejects on schema mismatch', async () => {
    const [fetch] = makeFetch(200, { boards: [{ id: 123 }] }); // invalid
    const client = makeClient(fetch);
    await expect(client.listBoards()).rejects.toThrow();
  });

  it('getBoard: returns null on 404', async () => {
    const [fetch] = makeFetch(404, { error: 'not found' });
    const client = makeClient(fetch);
    const result = await client.getBoard('b1');
    expect(result).toBeNull();
  });

  it('getBoard: returns board on 200', async () => {
    const [fetch] = makeFetch(200, board);
    const client = makeClient(fetch);
    const result = await client.getBoard('b1');
    expect(result).toEqual(board);
  });

  it('createBoard: POST /boards with body', async () => {
    const [fetch] = makeFetch(200, board);
    const client = makeClient(fetch);
    const input = { slug: 'main', title: 'Main', description: '' };
    const result = await client.createBoard(input);
    expect(result).toEqual(board);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  });

  it('updateBoard: PUT /boards/:id with body', async () => {
    const [fetch] = makeFetch(200, board);
    const client = makeClient(fetch);
    const result = await client.updateBoard('b1', { title: 'Updated' });
    expect(result).toEqual(board);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards/b1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('deleteBoard: DELETE /boards/:id', async () => {
    const [fetch] = makeFetch(200, { ok: true });
    const client = makeClient(fetch);
    await expect(client.deleteBoard('b1')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards/b1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws ProviderHttpError on non-2xx response', async () => {
    const [fetch] = makeFetch(500, { error: 'internal error' });
    const client = makeClient(fetch);
    try {
      await client.listBoards();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderHttpError);
      expect((err as ProviderHttpError).status).toBe(500);
      expect((err as ProviderHttpError).message).toBe('internal error');
    }
  });
});

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — items', () => {
  const item = {
    id: 'i1',
    boardId: 'b1',
    columnId: 'c1',
    swimlaneId: 's1',
    title: 'Task',
    body: '',
    status: 'open',
    priority: 'medium',
    tags: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    customFields: {},
  };

  it('listItems: GET /boards/:boardId/items', async () => {
    const [fetch] = makeFetch(200, { items: [item] });
    const client = makeClient(fetch);
    const result = await client.listItems('b1');
    expect(result).toEqual([item]);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards/b1/items',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getItem: GET /boards/:boardId/items/:itemId', async () => {
    const [fetch] = makeFetch(200, item);
    const client = makeClient(fetch);
    const result = await client.getItem('b1', 'i1');
    expect(result).toEqual(item);
  });

  it('getItem: returns null on 404', async () => {
    const [fetch] = makeFetch(404, { error: 'not found' });
    const client = makeClient(fetch);
    expect(await client.getItem('b1', 'i1')).toBeNull();
  });

  it('createItem: POST /boards/:boardId/items', async () => {
    const [fetch] = makeFetch(200, item);
    const client = makeClient(fetch);
    const input = {
      boardId: 'b1', columnId: 'c1', swimlaneId: 's1',
      title: 'Task', body: '', status: 'open', priority: 'medium' as const,
      tags: [], customFields: {},
    };
    const result = await client.createItem(input);
    expect(result).toEqual(item);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards/b1/items',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updateItem: PUT /boards/:boardId/items/:itemId', async () => {
    const [fetch] = makeFetch(200, item);
    const client = makeClient(fetch);
    await client.updateItem('b1', 'i1', { title: 'Updated' });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards/b1/items/i1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('deleteItem: DELETE /boards/:boardId/items/:itemId', async () => {
    const [fetch] = makeFetch(200, { ok: true });
    const client = makeClient(fetch);
    await client.deleteItem('b1', 'i1');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/boards/b1/items/i1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rejects malformed item response', async () => {
    const [fetch] = makeFetch(200, { items: [{ id: 1 }] }); // invalid
    const client = makeClient(fetch);
    await expect(client.listItems('b1')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — health', () => {
  it('health: calls /health and resolves on 200', async () => {
    const [fetch] = makeFetch(200, { ok: true });
    const client = makeClient(fetch);
    await expect(client.health()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/health',
      expect.objectContaining({}),
    );
  });

  it('health: throws ProviderHttpError on 503', async () => {
    const [fetch] = makeFetch(503, { error: 'unavailable' });
    const client = makeClient(fetch);
    await expect(client.health()).rejects.toBeInstanceOf(ProviderHttpError);
  });
});

// ---------------------------------------------------------------------------
// Base URL normalisation
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — base URL', () => {
  it('strips trailing slash from baseUrl', async () => {
    const [fetch] = makeFetch(200, { boards: [] });
    const client = new SidecarHttpClient({
      baseUrl: 'http://localhost:3001/',
      fetchFn: fetch as typeof globalThis.fetch,
    });
    await client.listBoards();
    const url = (fetch.mock.calls[0] as [string])[0];
    expect(url).toBe('http://localhost:3001/boards');
  });
});
