import { describe, it, expect } from 'vitest';
import { createInstallationTokenCache } from '../src/github-app/installation-token-cache.js';
import { MintFailureError } from '../src/github-app/types.js';
import type { InstallationToken } from '../src/github-app/types.js';
import type { Clock } from '../src/github-app/clock.js';

/** Create a fake clock whose value can be advanced by the test. */
function makeFakeClock(startMs: number): Clock & { advanceMs(ms: number): void } {
  let now = startMs;
  return {
    now: () => new Date(now),
    advanceMs(ms: number) { now += ms; },
  };
}

/** Create a minter that succeeds and records how many times it was called. */
function makeSuccessMinter(token: string, ttlMs: number, clock: Clock) {
  let calls = 0;
  const minter = async (): Promise<InstallationToken> => {
    calls++;
    return { token, expiresAt: new Date(clock.now().getTime() + ttlMs) };
  };
  return { minter, getCalls: () => calls };
}

describe('installation-token-cache', () => {
  const TOKEN = 'ghs_test_token_abc';
  const TTL = 60 * 60 * 1000; // 1 hour

  it('returns cached token on cache hit without re-minting', async () => {
    const clock = makeFakeClock(0);
    const { minter, getCalls } = makeSuccessMinter(TOKEN, TTL, clock);
    const provider = createInstallationTokenCache({ minter, clock });

    const first = await provider.getInstallationToken();
    const second = await provider.getInstallationToken();

    expect(first.token).toBe(TOKEN);
    expect(second.token).toBe(TOKEN);
    expect(getCalls()).toBe(1); // only minted once
  });

  it('refreshes when token is within 5 minutes of expiry', async () => {
    const clock = makeFakeClock(0);
    const { minter, getCalls } = makeSuccessMinter(TOKEN, TTL, clock);
    const provider = createInstallationTokenCache({ minter, clock });

    // Prime the cache
    await provider.getInstallationToken();
    expect(getCalls()).toBe(1);

    // Advance to 4 minutes before expiry (TTL - 4 min < 5 min threshold)
    clock.advanceMs(TTL - 4 * 60 * 1000);

    const refreshed = await provider.getInstallationToken();
    expect(refreshed.token).toBe(TOKEN);
    expect(getCalls()).toBe(2); // re-minted
  });

  it('does NOT refresh when token has more than 5 minutes remaining', async () => {
    const clock = makeFakeClock(0);
    const { minter, getCalls } = makeSuccessMinter(TOKEN, TTL, clock);
    const provider = createInstallationTokenCache({ minter, clock });

    await provider.getInstallationToken();
    clock.advanceMs(TTL - 6 * 60 * 1000); // 6 minutes left — above threshold

    await provider.getInstallationToken();
    expect(getCalls()).toBe(1); // no re-mint
  });

  it('coalesces concurrent callers into a single in-flight mint', async () => {
    const clock = makeFakeClock(0);
    let calls = 0;
    const minter = async (): Promise<InstallationToken> => {
      calls++;
      await new Promise<void>((r) => setTimeout(r, 10));
      return { token: TOKEN, expiresAt: new Date(clock.now().getTime() + TTL) };
    };
    const provider = createInstallationTokenCache({ minter, clock });

    // Fire three concurrent requests simultaneously (cache empty)
    const [a, b, c] = await Promise.all([
      provider.getInstallationToken(),
      provider.getInstallationToken(),
      provider.getInstallationToken(),
    ]);

    expect(a.token).toBe(TOKEN);
    expect(b.token).toBe(TOKEN);
    expect(c.token).toBe(TOKEN);
    expect(calls).toBe(1); // only one mint despite three concurrent callers
  });

  it('surfaces minter failure as MintFailureError', async () => {
    const clock = makeFakeClock(0);
    const minter = async (): Promise<InstallationToken> => {
      throw new MintFailureError('network', 'simulated network error');
    };
    const provider = createInstallationTokenCache({ minter, clock });

    await expect(provider.getInstallationToken()).rejects.toThrow(MintFailureError);
  });

  it('dispose clears cache state so next call re-mints', async () => {
    const clock = makeFakeClock(0);
    const { minter, getCalls } = makeSuccessMinter(TOKEN, TTL, clock);
    const provider = createInstallationTokenCache({ minter, clock });

    await provider.getInstallationToken();
    expect(getCalls()).toBe(1);

    provider.dispose?.();

    await provider.getInstallationToken();
    expect(getCalls()).toBe(2); // re-minted after dispose
  });
});
