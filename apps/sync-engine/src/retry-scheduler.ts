import type { RemoteRetryConfig } from './types.js';

/**
 * Task outcome tags understood by the scheduler.
 *
 * - `success`         Task completed successfully → reset backoff.
 * - `network-failure` Transient failure → advance backoff, reschedule.
 * - `conflict`        Conflict pending → suspend scheduling.
 * - `skip`            Task decided to skip this tick (e.g. nothing to do).
 */
export type TaskOutcome = 'success' | 'network-failure' | 'conflict' | 'skip';

/**
 * RetryScheduler: runs an async task on a configurable interval with
 * exponential backoff and jitter on `network-failure`.
 *
 * - On `success` or `skip`: delay resets to `baseIntervalMs`.
 * - On `network-failure`: delay doubles up to `retry.maxMs` with random jitter.
 * - On `conflict`: scheduling is suspended until `setConflictPending(false)`.
 * - `manualTick()`: for tests — execute the task immediately, bypassing timers.
 */
export class RetryScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentDelayMs: number;
  private conflictPending = false;
  private cancelled = false;
  private running = false;

  constructor(
    private readonly baseIntervalMs: number,
    private readonly retryConfig: RemoteRetryConfig,
    private readonly task: () => Promise<TaskOutcome>,
    private readonly label: string = 'scheduler',
  ) {
    this.currentDelayMs = baseIntervalMs;
  }

  /** Start the scheduler. The first tick fires after `baseIntervalMs`. */
  start(): void {
    this.cancelled = false;
    this._scheduleNext(this.baseIntervalMs);
  }

  /** Cancel the scheduler and clear any pending timer. */
  cancel(): void {
    this.cancelled = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Pause/resume scheduling based on conflict state.
   * When `true`, pending timers are cleared and no new ones are set.
   * When set back to `false`, the scheduler reschedules from baseline.
   */
  setConflictPending(pending: boolean): void {
    const wasConflict = this.conflictPending;
    this.conflictPending = pending;
    if (!pending && wasConflict && !this.cancelled) {
      // Resume scheduling from baseline
      this.currentDelayMs = this.baseIntervalMs;
      this._scheduleNext(this.baseIntervalMs);
    } else if (pending && this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * For tests: execute the task immediately, update backoff, and reschedule.
   * Does not fire if cancelled or conflict pending.
   */
  async manualTick(): Promise<TaskOutcome> {
    if (this.cancelled) return 'skip';
    if (this.conflictPending) return 'conflict';
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this._executeTask();
  }

  private _scheduleNext(delayMs: number): void {
    if (this.cancelled || this.conflictPending) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.cancelled && !this.conflictPending) {
        void this._executeTask();
      }
    }, delayMs);
  }

  private async _executeTask(): Promise<TaskOutcome> {
    if (this.running) return 'skip';
    this.running = true;
    let outcome: TaskOutcome = 'skip';
    try {
      outcome = await this.task();
    } catch {
      outcome = 'network-failure';
    } finally {
      this.running = false;
    }
    this._onOutcome(outcome);
    return outcome;
  }

  private _onOutcome(outcome: TaskOutcome): void {
    if (this.cancelled) return;

    if (outcome === 'conflict') {
      this.conflictPending = true;
      return;
    }

    if (outcome === 'network-failure') {
      // Advance backoff with jitter
      const base = Math.min(
        this.currentDelayMs * this.retryConfig.factor,
        this.retryConfig.maxMs,
      );
      const jitter = base * this.retryConfig.jitter * (Math.random() * 2 - 1);
      this.currentDelayMs = Math.max(
        this.retryConfig.initialMs,
        Math.min(this.retryConfig.maxMs, Math.round(base + jitter)),
      );
      this._scheduleNext(this.currentDelayMs);
      return;
    }

    // success or skip — reset to baseline
    this.currentDelayMs = this.baseIntervalMs;
    this._scheduleNext(this.baseIntervalMs);
  }

  /** Current computed delay (useful for debugging/status). */
  get nextDelayMs(): number {
    return this.currentDelayMs;
  }

  /** Label for log messages. */
  get name(): string {
    return this.label;
  }
}
