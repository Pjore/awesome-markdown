import type { NetworkFailureReason } from '../../src/types.js';
import type { PullFault } from '../../src/puller.js';
import type { PushFault } from '../../src/pusher.js';

/**
 * NetworkFault is a toggleable fault injector implementing both PullFault
 * and PushFault interfaces.
 *
 * Swap it into puller/pusher via the Engine's setPullFault/setPushFault methods
 * or pass it directly to pullOnce/pushOnce in unit tests.
 *
 * Usage:
 *   const fault = new NetworkFault();
 *   fault.enable();             // all pull/push calls return network-failure
 *   fault.disable();            // normal operation resumes
 *   fault.enable('auth');       // specific failure reason
 */
export class NetworkFault implements PullFault, PushFault {
  private _active = false;
  private _reason: NetworkFailureReason = 'refused';

  /**
   * Activate the fault. All pull/push calls will return
   * `{ kind: 'network-failure', reason }` without invoking git.
   */
  enable(reason: NetworkFailureReason = 'refused'): void {
    this._active = true;
    this._reason = reason;
  }

  /** Deactivate the fault; operations proceed normally. */
  disable(): void {
    this._active = false;
  }

  shouldFail(): boolean {
    return this._active;
  }

  getReason(): NetworkFailureReason {
    return this._reason;
  }

  get isActive(): boolean {
    return this._active;
  }
}
