/**
 * SseClient — getSseToken (ticket pattern) and configurable token parameter.
 * Additive tests; existing SSE tests are not modified.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from '../src/sse-client.js';

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
  emit(t: string): void {
    for (const fn of this.listeners[t] ?? []) fn(new Event(t));
  }
}

const URL_ = 'http://localhost:3001/subscribe';
const EventSourceCtor = FakeEventSource as unknown as typeof EventSource;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function latestEs(): FakeEventSource {
  const es = FakeEventSource.instances.at(-1);
  if (!es) throw new Error('No FakeEventSource created');
  return es;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SseClient — getSseToken', () => {
  it('uses getSseToken for the SSE URL instead of getToken', async () => {
    const getToken = vi.fn(async () => 'bearer-jwt');
    const getSseToken = vi.fn(async () => 'ticket-1');
    new SseClient({ url: URL_, EventSourceCtor, getToken, getSseToken }).start();
    await flushMicrotasks();

    expect(getSseToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
    expect(latestEs().url).toBe(`${URL_}?token=ticket-1`);
  });

  it('works without getToken', async () => {
    new SseClient({ url: URL_, EventSourceCtor, getSseToken: async () => 'ticket-1' }).start();
    await flushMicrotasks();
    expect(latestEs().url).toBe(`${URL_}?token=ticket-1`);
  });

  it('mints a fresh ticket on every reconnect (single-use tickets)', async () => {
    let n = 0;
    const getSseToken = vi.fn(async () => `ticket-${++n}`);
    const client = new SseClient({ url: URL_, EventSourceCtor, getSseToken });
    client.start();
    await flushMicrotasks();
    latestEs().emit('open');
    latestEs().emit('error');
    await vi.runAllTimersAsync();
    await flushMicrotasks();

    expect(getSseToken).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances.map(es => es.url)).toEqual([
      `${URL_}?token=ticket-1`,
      `${URL_}?token=ticket-2`,
    ]);
    expect(client.getState()).toBe('connecting');
  });
});

describe('SseClient — tokenParam', () => {
  it('defaults to "token"', async () => {
    new SseClient({ url: URL_, EventSourceCtor, getToken: async () => 'abc' }).start();
    await flushMicrotasks();
    expect(latestEs().url).toBe(`${URL_}?token=abc`);
  });

  it('uses a custom parameter name with getSseToken', async () => {
    new SseClient({ url: URL_, EventSourceCtor, getSseToken: async () => 'tkt', tokenParam: 'ticket' }).start();
    await flushMicrotasks();
    expect(latestEs().url).toBe(`${URL_}?ticket=tkt`);
  });

  it('uses a custom parameter name with getToken', async () => {
    new SseClient({ url: URL_, EventSourceCtor, getToken: async () => 'jwt', tokenParam: 'access_token' }).start();
    await flushMicrotasks();
    expect(latestEs().url).toBe(`${URL_}?access_token=jwt`);
  });

  it('URL-encodes the credential and appends to an existing query string', async () => {
    new SseClient({
      url: `${URL_}?since=5`,
      EventSourceCtor,
      getSseToken: async () => 'a+b/c=',
      tokenParam: 'ticket',
    }).start();
    await flushMicrotasks();
    expect(latestEs().url).toBe(`${URL_}?since=5&ticket=a%2Bb%2Fc%3D`);
  });

  it('ignores tokenParam when there is no credential', async () => {
    new SseClient({ url: URL_, EventSourceCtor, tokenParam: 'ticket' }).start();
    await flushMicrotasks();
    expect(latestEs().url).toBe(URL_);
  });
});

describe('SseClient — credential failures', () => {
  it('retries with backoff when the credential fetch rejects', async () => {
    const getSseToken = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ticket endpoint down'))
      .mockResolvedValue('ticket-ok');
    const client = new SseClient({ url: URL_, EventSourceCtor, getSseToken });
    client.start();
    await flushMicrotasks();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(client.getState()).toBe('reconnecting');

    await vi.runAllTimersAsync();
    await flushMicrotasks();
    expect(latestEs().url).toBe(`${URL_}?token=ticket-ok`);
    latestEs().emit('open');
    expect(client.getState()).toBe('online');
  });

  it('does not open an EventSource if stopped while the credential is in flight', async () => {
    let resolve!: (t: string) => void;
    const getSseToken = vi.fn(() => new Promise<string>(r => { resolve = r; }));
    const client = new SseClient({ url: URL_, EventSourceCtor, getSseToken });
    client.start();
    await flushMicrotasks();
    client.stop();
    resolve('late-ticket');
    await flushMicrotasks();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(client.getState()).toBe('offline');
  });

  it('does not open an EventSource if idled while the credential is in flight', async () => {
    let resolve!: (t: string) => void;
    const getSseToken = vi.fn(() => new Promise<string>(r => { resolve = r; }));
    const client = new SseClient({ url: URL_, EventSourceCtor, getSseToken });
    client.start();
    await flushMicrotasks();
    client.idle();
    resolve('late-ticket');
    await flushMicrotasks();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(client.getState()).toBe('idle');
  });
});
