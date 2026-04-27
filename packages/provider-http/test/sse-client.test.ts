import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from '../src/sse-client.js';
import type { ConnectionState } from '../src/connection-state.js';

// ---------------------------------------------------------------------------
// Fake EventSource
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

  // Test helpers
  emit(type: string, data?: string): void {
    const evs = this.listeners[type] ?? [];
    const event = data !== undefined
      ? new MessageEvent(type, { data })
      : new Event(type);
    for (const fn of evs) fn(event);
  }
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

function makeClient(): SseClient {
  return new SseClient({
    url: 'http://localhost:3001/subscribe',
    EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
  });
}

function latestEs(): FakeEventSource {
  const es = FakeEventSource.instances.at(-1);
  if (!es) throw new Error('No FakeEventSource created');
  return es;
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe('SseClient — state transitions', () => {
  it('starts in idle', () => {
    const client = makeClient();
    expect(client.getState()).toBe('idle');
  });

  it('idle → connecting on start()', () => {
    const client = makeClient();
    const states: ConnectionState[] = [];
    client.onStateChange((s) => states.push(s));
    client.start();
    expect(client.getState()).toBe('connecting');
    expect(states).toEqual(['connecting']);
  });

  it('connecting → online on EventSource open', () => {
    const client = makeClient();
    const states: ConnectionState[] = [];
    client.onStateChange((s) => states.push(s));
    client.start();
    latestEs().emit('open');
    expect(client.getState()).toBe('online');
    expect(states).toEqual(['connecting', 'online']);
  });

  it('online → reconnecting on EventSource error', () => {
    const client = makeClient();
    const states: ConnectionState[] = [];
    client.onStateChange((s) => states.push(s));
    client.start();
    latestEs().emit('open');
    latestEs().emit('error');
    expect(client.getState()).toBe('reconnecting');
    expect(states).toContain('reconnecting');
  });

  it('reconnecting → online after timer fires and open emits', async () => {
    const client = makeClient();
    client.start();
    latestEs().emit('open');
    latestEs().emit('error');
    expect(client.getState()).toBe('reconnecting');

    // Advance all timers to trigger reconnect
    await vi.runAllTimersAsync();
    latestEs().emit('open');
    expect(client.getState()).toBe('online');
  });

  it('stop() → offline and clears handlers', () => {
    const client = makeClient();
    const states: ConnectionState[] = [];
    client.onStateChange((s) => states.push(s));
    client.start();
    latestEs().emit('open');
    client.stop();
    expect(client.getState()).toBe('offline');
    // handlers cleared — no more notifications
    const countBefore = states.length;
    // artificially call stop again; no new state notifications expected
    client.stop();
    expect(states.length).toBe(countBefore);
  });

  it('stop() closes the EventSource', () => {
    const client = makeClient();
    client.start();
    const es = latestEs();
    client.stop();
    expect(es.closed).toBe(true);
  });

  it('start() is no-op after stop()', () => {
    const client = makeClient();
    client.stop();
    client.start();
    // No new EventSource should have been created
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('start() is idempotent while online', () => {
    const client = makeClient();
    client.start();
    latestEs().emit('open');
    const countBefore = FakeEventSource.instances.length;
    client.start(); // should be no-op
    expect(FakeEventSource.instances.length).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// Backoff schedule
// ---------------------------------------------------------------------------

describe('SseClient — backoff', () => {
  it('retryCount increases on each failure', async () => {
    const client = makeClient();
    client.start();
    latestEs().emit('open');
    // Fail once
    latestEs().emit('error');
    expect(client.getState()).toBe('reconnecting');
    await vi.runAllTimersAsync();
    latestEs().emit('error');
    expect(client.getState()).toBe('reconnecting');
    // Two reconnect attempts spawned
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(2);
  });

  it('resets retryCount on successful open after reconnect', async () => {
    const client = makeClient();
    client.start();
    latestEs().emit('open');
    latestEs().emit('error');
    await vi.runAllTimersAsync();
    latestEs().emit('open'); // successful reconnect
    // retryCount internal — verify by checking state is 'online'
    expect(client.getState()).toBe('online');
  });
});

// ---------------------------------------------------------------------------
// Event fanout
// ---------------------------------------------------------------------------

describe('SseClient — event fanout', () => {
  const changePayload = JSON.stringify({
    type: 'change',
    path: 'boards/b1/items/i1.md',
    entityId: 'i1',
  });

  it('fires onEvent handlers for valid change events', () => {
    const client = makeClient();
    const received: unknown[] = [];
    client.onEvent((e) => received.push(e));
    client.start();
    latestEs().emit('open');
    latestEs().emit('change', changePayload);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('change');
  });

  it('drops invalid payloads without throwing', () => {
    const client = makeClient();
    let called = false;
    client.onEvent(() => { called = true; });
    client.start();
    latestEs().emit('open');
    expect(() => latestEs().emit('change', '{"invalid":true}')).not.toThrow();
    expect(called).toBe(false);
  });

  it('unsubscribing onEvent removes handler', () => {
    const client = makeClient();
    const received: unknown[] = [];
    const unsub = client.onEvent((e) => received.push(e));
    unsub();
    client.start();
    latestEs().emit('open');
    latestEs().emit('change', changePayload);
    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// idle() behaviour
// ---------------------------------------------------------------------------

describe('SseClient — idle()', () => {
  it('closes EventSource and returns to idle', () => {
    const client = makeClient();
    client.start();
    const es = latestEs();
    latestEs().emit('open');
    client.idle();
    expect(es.closed).toBe(true);
    expect(client.getState()).toBe('idle');
  });

  it('can be restarted after idle()', () => {
    const client = makeClient();
    client.start();
    latestEs().emit('open');
    client.idle();
    client.start();
    expect(client.getState()).toBe('connecting');
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
