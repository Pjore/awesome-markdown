import type { Clock } from './clock.js';
import type { GitCredentialProvider, InstallationToken } from './types.js';
import { MintFailureError } from './types.js';

/** Function that mints a fresh installation token. */
export type Minter = () => Promise<InstallationToken>;

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a `GitCredentialProvider` that caches the installation token and
 * refreshes it when within 5 minutes of expiry.
 *
 * Concurrent callers coalesce onto a single in-flight mint request.
 */
export function createInstallationTokenCache(opts: {
  minter: Minter;
  clock: Clock;
}): GitCredentialProvider {
  const { minter, clock } = opts;

  let cached: InstallationToken | null = null;
  let inflight: Promise<InstallationToken> | null = null;

  function isStale(): boolean {
    if (!cached) return true;
    const msUntilExpiry = cached.expiresAt.getTime() - clock.now().getTime();
    return msUntilExpiry < REFRESH_THRESHOLD_MS;
  }

  async function refresh(): Promise<InstallationToken> {
    if (inflight) return inflight;

    inflight = minter().then(
      (token) => {
        cached = token;
        inflight = null;
        return token;
      },
      (err: unknown) => {
        inflight = null;
        throw err instanceof MintFailureError
          ? err
          : new MintFailureError('unknown', String(err), err);
      },
    );

    return inflight;
  }

  return {
    async getInstallationToken(): Promise<InstallationToken> {
      if (!isStale() && cached) {
        return cached;
      }
      return refresh();
    },

    dispose(): void {
      cached = null;
      inflight = null;
    },
  };
}
