import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Engine } from '../src/engine.js';
import { createTempRepo } from './helpers/tempRepo.js';
import type { TempRepo } from './helpers/tempRepo.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal Engine config for coalescing tests.
 * Remote sync is disabled so _pullTask returns 'skip' by default.
 * We replace _pullTask on the instance with a spy for deterministic control.
 */
function makeEngine(repoRoot: string): Engine {
  return new Engine({
    repoRoot,
    contentDir: 'content',
    commitAuthorName: 'test',
    commitAuthorEmail: 'test@local',
    debounceMs: 200,
    port: 7402,
    host: '127.0.0.1',
  });
}

/** Create a controllable pull task stub that returns a pending promise. */
function makePullStub(): { spy: () => Promise<'skip'>; resolvers: Array<() => void>; rejecters: Array<(e: Error) => void> } {
  const resolvers: Array<() => void> = [];
  const rejecters: Array<(e: Error) => void> = [];
  const spy = vi.fn<[], Promise<'skip'>>(() =>
    new Promise<'skip'>((res, rej) => {
      resolvers.push(() => res('skip'));
      rejecters.push(rej);
    }),
  );
  return { spy, resolvers, rejecters };
}

/** Flush the microtask queue so promise continuations can run. */
async function flush(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Engine.triggerPullNow coalescing', () => {
  let repo: TempRepo;
  let engine: Engine;

  beforeEach(async () => {
    repo = await createTempRepo();
    engine = makeEngine(repo.repoRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repo.cleanup();
  });

  // -------------------------------------------------------------------------
  // Return value
  // -------------------------------------------------------------------------

  it('returns synchronously (return value is undefined, not thenable)', () => {
    const { spy } = makePullStub();
    (engine as unknown as Record<string, unknown>)['_pullTask'] = spy;

    const result = engine.triggerPullNow({ deliveryId: 'del-1' });

    expect(result).toBeUndefined();
    // Must not be a Promise — check the type tag rather than a thenable shape
    expect(typeof result).not.toBe('object');

    // Resolve to avoid dangling promise
    spy.mock.results[0]?.value instanceof Promise
      ? void spy.mock.results[0].value.then(() => undefined)
      : undefined;
  });

  // -------------------------------------------------------------------------
  // Single call
  // -------------------------------------------------------------------------

  it('single call → exactly one pull', async () => {
    const { spy, resolvers } = makePullStub();
    (engine as unknown as Record<string, unknown>)['_pullTask'] = spy;

    engine.triggerPullNow({ deliveryId: 'del-1' });

    expect(spy).toHaveBeenCalledTimes(1);

    resolvers[0]?.();
    await flush();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Two rapid calls
  // -------------------------------------------------------------------------

  it('two rapid calls → exactly two pulls (second queued, runs after first)', async () => {
    const { spy, resolvers } = makePullStub();
    (engine as unknown as Record<string, unknown>)['_pullTask'] = spy;

    engine.triggerPullNow({ deliveryId: 'del-1' });
    engine.triggerPullNow({ deliveryId: 'del-2' });

    // Only one pull started so far
    expect(spy).toHaveBeenCalledTimes(1);

    // Complete the first pull
    resolvers[0]?.();
    await flush();

    // Second pull should have started
    expect(spy).toHaveBeenCalledTimes(2);

    // Complete the second pull
    resolvers[1]?.();
    await flush();

    // Exactly two pulls total
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Five rapid calls → two pulls max
  // -------------------------------------------------------------------------

  it('five rapid calls during one in-flight pull → exactly two pulls total', async () => {
    const { spy, resolvers } = makePullStub();
    (engine as unknown as Record<string, unknown>)['_pullTask'] = spy;

    // Fire all 5 calls before the first pull resolves
    engine.triggerPullNow({ deliveryId: 'del-1' });
    engine.triggerPullNow({ deliveryId: 'del-2' });
    engine.triggerPullNow({ deliveryId: 'del-3' });
    engine.triggerPullNow({ deliveryId: 'del-4' });
    engine.triggerPullNow({ deliveryId: 'del-5' });

    // Only first pull started
    expect(spy).toHaveBeenCalledTimes(1);

    // Complete first pull
    resolvers[0]?.();
    await flush();

    // Second pull should have started (the queued one)
    expect(spy).toHaveBeenCalledTimes(2);

    // Complete second pull
    resolvers[1]?.();
    await flush();

    // Exactly two pulls — the burst of 5 collapsed to 1 queued
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Calls arriving during the queued pull
  // -------------------------------------------------------------------------

  it('calls arriving during the queued pull queue one more pull', async () => {
    const { spy, resolvers } = makePullStub();
    (engine as unknown as Record<string, unknown>)['_pullTask'] = spy;

    // Start pull 1 and queue pull 2
    engine.triggerPullNow({ deliveryId: 'del-1' });
    engine.triggerPullNow({ deliveryId: 'del-2' });

    // Complete pull 1 → pull 2 starts
    resolvers[0]?.();
    await flush();
    expect(spy).toHaveBeenCalledTimes(2);

    // New call during pull 2 → should queue pull 3
    engine.triggerPullNow({ deliveryId: 'del-3' });

    // Complete pull 2 → pull 3 starts
    resolvers[1]?.();
    await flush();
    expect(spy).toHaveBeenCalledTimes(3);

    // Complete pull 3
    resolvers[2]?.();
    await flush();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // Exception swallowing
  // -------------------------------------------------------------------------

  it('exception inside _pullTask does not bubble out of triggerPullNow', async () => {
    const failingSpy = vi.fn(async () => {
      throw new Error('simulated pull failure');
    });
    (engine as unknown as Record<string, unknown>)['_pullTask'] = failingSpy;

    // Must not throw synchronously
    expect(() => engine.triggerPullNow({ deliveryId: 'del-1' })).not.toThrow();

    // Let the rejection propagate internally (should be swallowed)
    await flush();

    // Engine state should be clean — a new call starts a fresh pull
    const { spy: spy2, resolvers: res2 } = makePullStub();
    (engine as unknown as Record<string, unknown>)['_pullTask'] = spy2;

    engine.triggerPullNow({ deliveryId: 'del-2' });
    expect(spy2).toHaveBeenCalledTimes(1);

    res2[0]?.();
    await flush();
    expect(spy2).toHaveBeenCalledTimes(1);
  });
});
