/**
 * Tests for authenticated / unauthenticated paths in SidecarHttpClient.
 *
 * These are additive tests — the existing http-client.test.ts is not modified.
 */

import { describe, it, expect, vi } from 'vitest';
import { SidecarHttpClient } from '../src/http-client.js';

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

const NOW = '2024-01-01T00:00:00.000Z';

const board = {
  entityType: 'board' as const,
  slug: 'demo', title: 'Demo',
  createdAt: NOW, updatedAt: NOW,
};

// ---------------------------------------------------------------------------
// Authenticated fetch (with getToken)
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — getToken (authenticated)', () => {
  it('attaches Authorization: Bearer header when getToken is provided', async () => {
    const [fetch, calls] = makeFetch(200, [board]);
    const getToken = vi.fn(async () => 'my-secret-token');
    const client = new SidecarHttpClient({
      baseUrl: 'http://localhost:7701',
      fetchFn: fetch as typeof globalThis.fetch,
      getToken,
    });
    await client.listBoards();

    expect(getToken).toHaveBeenCalledOnce();
    const headers = calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-token');
  });

  it('calls getToken fresh for each request', async () => {
    const [fetch] = makeFetch(200, [board]);
    let callCount = 0;
    const getToken = vi.fn(async () => `token-${++callCount}`);
    const client = new SidecarHttpClient({
      baseUrl: 'http://localhost:7701',
      fetchFn: fetch as typeof globalThis.fetch,
      getToken,
    });
    await client.listBoards();
    await client.listBoards();
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('still sends Content-Type and Accept headers alongside Authorization', async () => {
    const [fetch, calls] = makeFetch(200, [board]);
    const client = new SidecarHttpClient({
      baseUrl: 'http://localhost:7701',
      fetchFn: fetch as typeof globalThis.fetch,
      getToken: async () => 'tok',
    });
    await client.listBoards();
    const headers = calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer tok');
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated fetch (no getToken)
// ---------------------------------------------------------------------------

describe('SidecarHttpClient — no getToken (unauthenticated)', () => {
  it('does NOT attach Authorization header when getToken is omitted', async () => {
    const [fetch, calls] = makeFetch(200, [board]);
    const client = new SidecarHttpClient({
      baseUrl: 'http://localhost:7701',
      fetchFn: fetch as typeof globalThis.fetch,
    });
    await client.listBoards();
    const headers = calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('still sends Content-Type and Accept headers', async () => {
    const [fetch, calls] = makeFetch(200, [board]);
    const client = new SidecarHttpClient({
      baseUrl: 'http://localhost:7701',
      fetchFn: fetch as typeof globalThis.fetch,
    });
    await client.listBoards();
    const headers = calls[0]![1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
  });
});
