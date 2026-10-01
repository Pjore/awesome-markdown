/**
 * createHttpProvider — getSseToken / sseTokenParam wiring.
 * Additive tests; existing provider tests are not modified.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpProvider } from '../src/provider.js';

type EvListener = (e: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, EvListener[]> = {};
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(t: string, fn: EvListener): void {
    (this.listeners[t] ??= []).push(fn);
  }
  close(): void {}
}

const EventSourceCtor = FakeEventSource as unknown as typeof EventSource;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function okFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createHttpProvider — SSE credentials', () => {
  it('uses getSseToken + sseTokenParam for SSE and getToken for HTTP', async () => {
    const fetchFn = okFetch();
    const getToken = vi.fn(async () => 'jwt');
    const getSseToken = vi.fn(async () => 'tkt');
    const p = createHttpProvider({
      baseUrl: 'https://app.example.com/api/v1/w/ws-1/',
      fetchFn: fetchFn as typeof fetch,
      EventSourceCtor,
      getToken,
      getSseToken,
      sseTokenParam: 'ticket',
    });

    p.subscribe(() => {});
    await flushMicrotasks();
    expect(FakeEventSource.instances.at(-1)?.url).toBe(
      'https://app.example.com/api/v1/w/ws-1/subscribe?ticket=tkt',
    );

    await p.listBoards();
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt');
    expect(getSseToken).toHaveBeenCalledOnce();
    p.stop();
  });

  it('keeps the default ?token=<getToken()> behaviour when getSseToken is omitted', async () => {
    const p = createHttpProvider({
      baseUrl: 'http://localhost:7701',
      fetchFn: okFetch() as typeof fetch,
      EventSourceCtor,
      getToken: async () => 'jwt',
    });
    p.subscribe(() => {});
    await flushMicrotasks();
    expect(FakeEventSource.instances.at(-1)?.url).toBe('http://localhost:7701/subscribe?token=jwt');
    p.stop();
  });
});
