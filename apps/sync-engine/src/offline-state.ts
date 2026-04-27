/**
 * Offline state machine for the sync-engine.
 *
 * Tracks the engine's connectivity state and debounces `offline` events so
 * a single transient blip does not cause flapping.
 *
 * State transitions:
 *   online  → offline   after `consecutiveFailuresForOffline` failures in a row
 *   offline → recovering on first subsequent success
 *   recovering → online after recovery callback fires
 *
 * Emitted transitions:
 *   { type: 'went-offline', reason }  — once, on state change to offline
 *   { type: 'recovered' }             — once, on state change back to online
 */

export type OfflineTransition =
  | { type: 'went-offline'; reason: string }
  | { type: 'recovered' };

export type OfflineStateConfig = {
  /**
   * Number of consecutive `network-failure` reports needed before the
   * state transitions to offline. Default: 2.
   */
  consecutiveFailuresForOffline?: number;
};

type State = 'online' | 'offline' | 'recovering';

export class OfflineState {
  private state: State = 'online';
  private consecutiveFailures = 0;
  private readonly threshold: number;
  private readonly handlers: Array<(t: OfflineTransition) => void> = [];
  private lastOfflineReason = '';

  constructor(config: OfflineStateConfig = {}) {
    this.threshold = config.consecutiveFailuresForOffline ?? 2;
  }

  /**
   * Register a handler invoked on each online↔offline transition.
   * Multiple handlers are supported; they fire in registration order.
   */
  onTransition(handler: (t: OfflineTransition) => void): void {
    this.handlers.push(handler);
  }

  /**
   * Report a network failure from a push/pull operation.
   * May trigger a `went-offline` transition after the debounce threshold.
   */
  reportFailure(reason: string): void {
    this.consecutiveFailures++;
    this.lastOfflineReason = reason;

    if (this.state === 'online' && this.consecutiveFailures >= this.threshold) {
      this.state = 'offline';
      this._emit({ type: 'went-offline', reason });
    }
    // If already offline, do not re-emit
  }

  /**
   * Report a successful push or pull operation.
   * If previously offline, triggers a `recovered` transition.
   */
  reportSuccess(): void {
    const wasOffline = this.state === 'offline';
    this.consecutiveFailures = 0;

    if (wasOffline) {
      this.state = 'recovering';
      this._emit({ type: 'recovered' });
      this.state = 'online';
    } else {
      this.state = 'online';
    }
  }

  /** Whether the state machine currently considers the remote reachable. */
  get isOnline(): boolean {
    return this.state !== 'offline';
  }

  /** The current state label. */
  get currentState(): State {
    return this.state;
  }

  /** The reason string from the most recent offline transition. */
  get lastReason(): string {
    return this.lastOfflineReason;
  }

  /** Current consecutive-failure count (useful for tests). */
  get failureCount(): number {
    return this.consecutiveFailures;
  }

  private _emit(transition: OfflineTransition): void {
    for (const h of this.handlers) {
      try {
        h(transition);
      } catch {
        // Handler errors must not crash the state machine
      }
    }
  }
}
