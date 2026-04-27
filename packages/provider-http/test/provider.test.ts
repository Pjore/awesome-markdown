import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpProvider, isHttpProvider } from '../src/provider.js';
import type { HttpPersistenceProvider } from '../src/provider.js';
import type { ProviderEventHandler } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Fake EventSource
// ---------------------------------------------------------------------------

type EvListener = (e: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, EvListener[]> = {};
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(t: string, fn: EvListener): void {
    (this.listeners[t] ??= []).push(fn);
  }
  close(): void { this.closed = true; }
  emit(t: string, data?: string): void {
    const evs = this.listeners[t] ?? [];
    const e = data !== undefined ? new MessageEvent(t, { data }) : new Event(t);
    for (const fn of evs) fn(e);
  }
}

// ---------------------------------------------------------------------------
// Fake fetch
// ---------------------------------------------------------------------------

const board = {
  id: 'b1', slug: 'test', title: 'Test',
  description: '', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
};

const item = {
  id: 'i1', boardId: 'b1', columnId: 'c1', swimlaneId: 's1',
  title: 'Task', body: '', status: 'open', priority: 'medium' as const,
  tags: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
  customFields: {},
};

const col = {
  id: 'c1', boardId: 'b1', title: 'Todo', order: 0,
};

const sl = {
  id: 's1', boardId: 'b1', title: 'Default', order: 0,
};

function buildFetch(
  responses: Array<{ url: string | RegExp; status?: number; body: unknown }>,
) {
  let idx = 0;
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = url.toString();
    // Find matching mock by order (simple sequential stub)
    const mock = responses[idx++] ?? responses.at(-1)!;
    void mock.url; // unused check
    return new Response(JSON.stringify(mock.body), {
      status: mock.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function makeProvider(fetchFn: ReturnType<typeof vi.fn>): HttpPersistenceProvider {
  return createHttpProvider({
    baseUrl: 'http://localhost:3001',
    fetchFn: fetchFn as typeof fetch,
    EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// isHttpProvider
// ---------------------------------------------------------------------------

describe('isHttpProvider', () => {
  it('returns true for http provider', () => {
    const p = makeProvider(vi.fn());
    expect(isHttpProvider(p)).toBe(true);
  });

  it('capabilities.type is "http"', () => {
    const p = makeProvider(vi.fn());
    expect(p.capabilities.type).toBe('http');
  });
});

// ---------------------------------------------------------------------------
// SSE lazy start/stop
// ---------------------------------------------------------------------------

describe('HttpProvider — lazy SSE lifecycle', () => {
  it('SSE client starts on first subscribe', () => {
    const p = makeProvider(buildFetch([]));
    expect(FakeEventSource.instances).toHaveLength(0);
    const unsub = p.subscribe(() => undefined);
    expect(FakeEventSource.instances).toHaveLength(1);
    unsub();
  });

  it('SSE client goes idle when last subscriber leaves', () => {
    const p = makeProvider(buildFetch([]));
    const unsub = p.subscribe(() => undefined);
    const es = FakeEventSource.instances[0]!;
    unsub();
    expect(es.closed).toBe(true);
  });

  it('SSE client restarts on new subscribe after idle', () => {
    const p = makeProvider(buildFetch([]));
    const u1 = p.subscribe(() => undefined);
    u1();
    const u2 = p.subscribe(() => undefined);
    u2();
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// SSE event fanout to subscribers
// ---------------------------------------------------------------------------

describe('HttpProvider — SSE event fanout', () => {
  const changePayload = JSON.stringify({
    type: 'change',
    path: 'boards/b1/items/i1.md',
    entityId: 'i1',
  });

  it('delivers change events to all subscribers', () => {
    const p = makeProvider(buildFetch([]));
    const events1: unknown[] = [];
    const events2: unknown[] = [];
    p.subscribe((e) => events1.push(e));
    p.subscribe((e) => events2.push(e));
    const es = FakeEventSource.instances[0]!;
    es.emit('open');
    es.emit('change', changePayload);
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it('does not deliver events to unsubscribed handler', () => {
    const p = makeProvider(buildFetch([]));
    const events: unknown[] = [];
    const unsub = p.subscribe((e) => events.push(e));
    const u2 = p.subscribe(() => undefined);
    unsub();
    const es = FakeEventSource.instances[0]!;
    es.emit('open');
    es.emit('change', changePayload);
    expect(events).toHaveLength(0);
    u2();
  });
});

// ---------------------------------------------------------------------------
// CRUD with boardId cache
// ---------------------------------------------------------------------------

describe('HttpProvider — boardId cache', () => {
  it('updateItem resolves boardId from cache after listItems', async () => {
    const updatedItem = { ...item, title: 'Updated' };
    const fetchFn = buildFetch([
      { url: /items$/, body: { items: [item] } },
      { url: /items\/i1/, body: updatedItem },
    ]);
    const p = makeProvider(fetchFn);
    await p.listItems('b1'); // populates cache
    const result = await p.updateItem('i1', { title: 'Updated' });
    expect(result.title).toBe('Updated');
    // Verify PUT went to correct nested path
    const calls = fetchFn.mock.calls as Array<[string]>;
    const putCall = calls.find((c) => c[0].includes('/boards/b1/items/i1'));
    expect(putCall).toBeTruthy();
  });

  it('throws descriptive error when boardId not in cache', async () => {
    const p = makeProvider(buildFetch([]));
    await expect(p.updateItem('unknown-id', {})).rejects.toThrow('boardId not found');
  });
});

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

describe('HttpProvider — connection state', () => {
  it('getConnectionState() returns idle before subscribe', () => {
    const p = makeProvider(buildFetch([]));
    expect(p.getConnectionState()).toBe('idle');
  });

  it('onConnectionStateChange() fires on state change', () => {
    const p = makeProvider(buildFetch([]));
    const states: string[] = [];
    p.onConnectionStateChange((s) => states.push(s));
    p.subscribe(() => undefined);
    expect(states).toContain('connecting');
  });

  it('stop() transitions to offline', () => {
    const p = makeProvider(buildFetch([]));
    const u = p.subscribe(() => undefined);
    p.stop();
    expect(p.getConnectionState()).toBe('offline');
    u();
  });
});

// ---------------------------------------------------------------------------
// CRUD: boards
// ---------------------------------------------------------------------------

describe('HttpProvider — board CRUD', () => {
  it('listBoards delegates to http client', async () => {
    const p = makeProvider(buildFetch([{ url: /boards$/, body: { boards: [board] } }]));
    const result = await p.listBoards();
    expect(result).toEqual([board]);
  });

  it('createBoard delegates to http client', async () => {
    const p = makeProvider(buildFetch([{ url: /boards$/, body: board }]));
    const result = await p.createBoard({ slug: 'test', title: 'Test', description: '' });
    expect(result.id).toBe('b1');
  });
});

// ---------------------------------------------------------------------------
// CRUD: columns and swimlanes cache
// ---------------------------------------------------------------------------

describe('HttpProvider — column and swimlane caches', () => {
  it('updateColumn uses cache after listColumns', async () => {
    const updatedCol = { ...col, title: 'Updated' };
    const fetchFn = buildFetch([
      { url: /columns$/, body: { columns: [col] } },
      { url: /columns\/c1/, body: updatedCol },
    ]);
    const p = makeProvider(fetchFn);
    await p.listColumns('b1');
    const result = await p.updateColumn('c1', { title: 'Updated' });
    expect(result.title).toBe('Updated');
  });

  it('updateSwimlane uses cache after listSwimlanes', async () => {
    const updatedSl = { ...sl, title: 'Updated' };
    const fetchFn = buildFetch([
      { url: /swimlanes$/, body: { swimlanes: [sl] } },
      { url: /swimlanes\/s1/, body: updatedSl },
    ]);
    const p = makeProvider(fetchFn);
    await p.listSwimlanes('b1');
    const result = await p.updateSwimlane('s1', { title: 'Updated' });
    expect(result.title).toBe('Updated');
  });
});
