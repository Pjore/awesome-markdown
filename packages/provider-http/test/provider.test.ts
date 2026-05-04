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

const NOW = '2024-01-01T00:00:00.000Z';

const board = {
  entityType: 'board' as const, slug: 'demo', title: 'Demo',
  createdAt: NOW, updatedAt: NOW,
};

const axis = {
  entityType: 'axis' as const, slug: 'todo', title: 'To Do',
  createdAt: NOW, updatedAt: NOW,
};

const item = {
  entityType: 'item' as const, slug: 'task-1', title: 'Task 1',
  createdAt: NOW, updatedAt: NOW,
};

const render = {
  board,
  axes: { columns: [axis], swimlanes: [] },
  cells: [{ columnSlug: 'todo', swimlaneSlug: 'default', readOnly: false, items: [item] }],
};

const homeless = { board, items: [item] };

function makeFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function makeProvider(fetchFn: ReturnType<typeof vi.fn>): HttpPersistenceProvider {
  return createHttpProvider({
    baseUrl: 'http://localhost:7701',
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
});

// ---------------------------------------------------------------------------
// Provider capabilities
// ---------------------------------------------------------------------------

describe('capabilities', () => {
  it('has type http with baseUrl', () => {
    const p = makeProvider(vi.fn());
    expect(p.capabilities.type).toBe('http');
    expect((p.capabilities as { type: 'http'; baseUrl: string }).baseUrl).toBe('http://localhost:7701');
  });
});

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

describe('provider.listBoards', () => {
  it('calls GET /boards and returns Board[]', async () => {
    const fetch = makeFetch([board]);
    const p = makeProvider(fetch);
    const result = await p.listBoards();
    expect(result).toEqual([board]);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/boards',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('provider.getBoard', () => {
  it('calls GET /boards/:slug', async () => {
    const fetch = makeFetch(board);
    const p = makeProvider(fetch);
    const result = await p.getBoard('demo');
    expect(result).toEqual(board);
  });

  it('returns null on 404', async () => {
    const fetch = makeFetch({ error: 'not found' }, 404);
    const p = makeProvider(fetch);
    expect(await p.getBoard('missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

describe('provider.listAxes', () => {
  it('calls GET /axes and returns Axis[]', async () => {
    const fetch = makeFetch([axis]);
    const p = makeProvider(fetch);
    const result = await p.listAxes();
    expect(result).toEqual([axis]);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/axes',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Render / Homeless
// ---------------------------------------------------------------------------

describe('provider.getBoardRender', () => {
  it('calls GET /boards/:slug/render and returns BoardRender', async () => {
    const fetch = makeFetch(render);
    const p = makeProvider(fetch);
    const result = await p.getBoardRender('demo');
    expect(result.board.slug).toBe('demo');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/boards/demo/render',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('provider.getHomeless', () => {
  it('calls GET /boards/:slug/homeless and returns Homeless', async () => {
    const fetch = makeFetch(homeless);
    const p = makeProvider(fetch);
    const result = await p.getHomeless('demo');
    expect(result.board.slug).toBe('demo');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/boards/demo/homeless',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

describe('provider.getItem', () => {
  it('calls GET /items/:slug', async () => {
    const fetch = makeFetch(item);
    const result = await makeProvider(fetch).getItem('task-1');
    expect(result).toEqual(item);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/items/task-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns null on 404', async () => {
    expect(await makeProvider(makeFetch({ error: 'not found' }, 404)).getItem('x')).toBeNull();
  });
});

describe('provider.createItem', () => {
  it('calls POST /items with body and returns Item', async () => {
    const fetch = makeFetch(item, 201);
    const req = { slug: 'task-1', title: 'Task 1', mutations: [] };
    const result = await makeProvider(fetch).createItem(req);
    expect(result).toEqual(item);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/items',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('provider.patchItem', () => {
  it('calls PATCH /items/:slug with mutations', async () => {
    const fetch = makeFetch(item);
    await makeProvider(fetch).patchItem('task-1', {
      mutations: [{ op: 'set', path: 'status', value: 'done' }],
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/items/task-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('provider.deleteItem', () => {
  it('calls DELETE /items/:slug', async () => {
    const fetch = makeFetch({ ok: true });
    await makeProvider(fetch).deleteItem('task-1');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7701/items/task-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

describe('provider.subscribe — SSE events', () => {
  it('maps SSE change event to ProviderEvent change', () => {
    const p = makeProvider(vi.fn());
    const events: Array<{ entitySlug: string }> = [];
    p.subscribe((e) => {
      if (e.type === 'change') events.push({ entitySlug: e.entitySlug });
    });

    const es = FakeEventSource.instances.at(-1)!;
    es.emit('open');
    es.emit('change', JSON.stringify({ type: 'change', path: 'task-1.md', entityId: 'task-1' }));
    expect(events).toHaveLength(1);
    expect(events[0]!.entitySlug).toBe('task-1');
  });

  it('stops SSE when all subscribers unsubscribe', () => {
    const p = makeProvider(vi.fn());
    const unsub = p.subscribe(() => undefined as unknown as void);
    const es = FakeEventSource.instances.at(-1)!;
    expect(es.closed).toBe(false);
    unsub();
    expect(es.closed).toBe(true);
  });

  it('unsubscribe stops receiving events', () => {
    const p = makeProvider(vi.fn());
    const events: number[] = [];
    const handler: ProviderEventHandler = () => events.push(1);
    const unsub = p.subscribe(handler);
    const es = FakeEventSource.instances.at(-1)!;
    es.emit('open');
    es.emit('change', JSON.stringify({ type: 'change', path: 'x.md', entityId: 'x' }));
    unsub();
    es.emit('change', JSON.stringify({ type: 'change', path: 'y.md', entityId: 'y' }));
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

describe('provider — connection state', () => {
  it('starts in idle', () => {
    const p = makeProvider(vi.fn());
    expect(p.getConnectionState()).toBe('idle');
  });

  it('goes to connecting once subscribe is called', () => {
    const p = makeProvider(vi.fn());
    p.subscribe(() => undefined as unknown as void);
    expect(p.getConnectionState()).toBe('connecting');
  });

  it('stop() tears down SSE', () => {
    const p = makeProvider(vi.fn());
    p.subscribe(() => undefined as unknown as void);
    p.stop();
    expect(p.getConnectionState()).toBe('offline');
  });
});

