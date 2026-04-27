import type { SyncEvent } from '@awesome-markdown/contracts';
import { SseHub } from '../../src/sse-hub.js';
import { Engine } from '../../src/engine.js';
import type { EngineConfig } from '../../src/types.js';
import type { BareRemote } from './bare-remote.js';
import type { NetworkFault } from './network-fault.js';

/**
 * Collected SSE event with a monotonic sequence number for ordering assertions.
 */
export type CollectedEvent = {
  seq: number;
  event: SyncEvent;
  timestamp: number;
};

/**
 * A test harness that wires an Engine with remote sync enabled, pointing at
 * a local bare-repo fixture. Events broadcast by the engine are captured in
 * `collectedEvents` for deterministic assertions.
 *
 * Pull and push schedulers are exposed via `triggerPull()` / `triggerPush()`
 * (manual-tick mode) so tests do not need to wait for timers.
 */
export type RemoteEngineHarness = {
  /** The Engine instance under test. */
  engine: Engine;
  /** All SSE events emitted by the engine, in order. */
  collectedEvents: CollectedEvent[];
  /** Clear collected events (useful between assertions). */
  clearEvents: () => void;
  /** Return only events of a given type. */
  eventsOfType: <T extends SyncEvent['type']>(type: T) => CollectedEvent[];
  /** Manually trigger one pull cycle without waiting for the timer. */
  triggerPull: () => Promise<void>;
  /** Manually trigger one push cycle without waiting for the timer. */
  triggerPush: () => Promise<void>;
  /** Inject a network fault (pass undefined to remove). */
  setPullFault: (fault: NetworkFault | undefined) => void;
  setPushFault: (fault: NetworkFault | undefined) => void;
  /** Stop the engine and clean up. */
  stop: () => Promise<void>;
};

/**
 * Create a remote-enabled engine harness backed by a BareRemote fixture.
 *
 * @param remote     The BareRemote fixture providing engine clone + bare repo.
 * @param token      GitHub token to inject (defaults to empty string for local tests).
 * @param debounceMs Debounce window in ms. Default: 120 ms.
 */
export async function createRemoteEngineHarness(
  remote: BareRemote,
  token = '',
  debounceMs = 120,
): Promise<RemoteEngineHarness> {
  const config: EngineConfig = {
    repoRoot: remote.engineClone,
    contentDir: 'content',
    commitAuthorName: 'sync-test',
    commitAuthorEmail: 'sync-test@local',
    debounceMs,
    port: 0,
    host: '127.0.0.1',
    remote: {
      enabled: true,
      pullIntervalMs: 60_000, // long interval — tests use manualTick
      pushTimeoutMs: 15_000,
      retry: { initialMs: 100, maxMs: 1000, factor: 2, jitter: 0 },
    },
    // Token may be empty for file:// remotes; we'll set it if provided
    ...(token ? { githubToken: token } : { githubToken: '' }),
  };

  // Build a custom hub so we can spy on broadcasts
  const hub = new SseHub();
  const collectedEvents: CollectedEvent[] = [];
  let seq = 0;

  // Wrap hub.broadcast to capture events
  const origBroadcast = hub.broadcast.bind(hub);
  hub.broadcast = (event: SyncEvent) => {
    collectedEvents.push({ seq: seq++, event, timestamp: Date.now() });
    origBroadcast(event);
  };

  const engine = new Engine(config, hub);
  await engine.start();

  // Allow watcher to settle
  await new Promise<void>((r) => setTimeout(r, 300));

  return {
    engine,
    collectedEvents,
    clearEvents: () => {
      collectedEvents.length = 0;
      seq = 0;
    },
    eventsOfType: <T extends SyncEvent['type']>(type: T) =>
      collectedEvents.filter((e) => e.event.type === type),
    triggerPull: () => engine.triggerPull(),
    triggerPush: () => engine.triggerPush(),
    setPullFault: (fault) => engine.setPullFault(fault),
    setPushFault: (fault) => engine.setPushFault(fault),
    stop: async () => {
      await engine.stop();
    },
  };
}
