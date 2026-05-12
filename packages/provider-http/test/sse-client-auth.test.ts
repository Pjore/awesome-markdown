/**
 * Tests for authenticated / unauthenticated SSE URL construction in SseClient.
 *
 * These are additive tests — the existing sse-client.test.ts is not modified.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from '../src/sse-client.js';

// ---------------------------------------------------------------------------
// Fake EventSource (same pattern as sse-client.test.ts)
// ---------------------------------------------------------------------------

type EventListener = (e: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  listeners: Record<string, EventListener[]> = {};
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]!.push(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: string): void {
    const evs = this.listeners[type] ?? [];
    const event = data !== undefined
      ? new MessageEvent(type, { data })
      : new Event(type);
    for (const fn of evs) fn(event);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all pending microtasks (resolved promises) in the queue. */
async function flushMicrotasks(): Promise<void> {
  // A few awaited ticks ensure any chained async/await in connect() resolves
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

function latestEs(): FakeEventSource {
  const es = FakeEventSource.instances.at(-1);
  if (!es) throw new Error('No FakeEventSource created');
  return es;
}

// ---------------------------------------------------------------------------
// Authenticated SSE (with getToken)
// ---------------------------------------------------------------------------

describe('SseClient — getToken (authenticated SSE URL)', () => {
  it('appends ?token=<value> to the SSE URL when getToken is provided', async () => {
    const getToken = vi.fn(async () => 'sse-token-abc');
    const client = new SseClient({
      url: 'http://localhost:3001/subscribe',
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      getToken,
    });

    client.start();
    await flushMicrotasks();

    expect(getToken).toHaveBeenCalledOnce();
    expect(latestEs().url).toBe('http://localhost:3001/subscribe?token=sse-token-abc');
  });

  it('fetches a fresh token on each reconnect', async () => {
    let callCount = 0;
    const getToken = vi.fn(async () => `token-${++callCount}`);
    const client = new SseClient({
      url: 'http://localhost:3001/subscribe',
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      getToken,
    });

    client.start();
    await flushMicrotasks();
    const firstUrl = latestEs().url;
    expect(firstUrl).toContain('token-1');

    // Trigger a reconnect cycle
    latestEs().emit('open');
    latestEs().emit('error');
    await vi.runAllTimersAsync();
    await flushMicrotasks();

    const secondUrl = latestEs().url;
    expect(secondUrl).toContain('token-2');
    expect(secondUrl).not.toBe(firstUrl);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated SSE (no getToken)
// ---------------------------------------------------------------------------

describe('SseClient — no getToken (unauthenticated SSE URL)', () => {
  it('does NOT append ?token= when getToken is omitted', async () => {
    const client = new SseClient({
      url: 'http://localhost:3001/subscribe',
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
    });

    client.start();
    await flushMicrotasks();

    expect(latestEs().url).toBe('http://localhost:3001/subscribe');
  });

  it('state transitions still work without getToken', async () => {
    const client = new SseClient({
      url: 'http://localhost:3001/subscribe',
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
    });

    client.start();
    await flushMicrotasks();
    latestEs().emit('open');
    expect(client.getState()).toBe('online');
  });
});
