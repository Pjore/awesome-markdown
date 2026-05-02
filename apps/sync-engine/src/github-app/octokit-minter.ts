import { createAppAuth } from '@octokit/auth-app';
import type { Clock } from './clock.js';
import type { InstallationToken, GithubAppCredentials } from './types.js';
import { MintFailureError } from './types.js';

export type MintInstallationTokenParams = {
  credentials: GithubAppCredentials;
  clock: Clock;
};

/**
 * Mint a GitHub App installation access token using `@octokit/auth-app`.
 * Wraps all errors into `MintFailureError` with an appropriate reason code.
 * Never logs the token, JWT, or PEM bytes.
 */
export async function mintInstallationToken(
  params: MintInstallationTokenParams,
): Promise<InstallationToken> {
  const { credentials, clock } = params;
  const { appId, installationId, privateKey } = credentials;

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });

  try {
    const result = await auth({ type: 'installation' });

    // `@octokit/auth-app` returns `expiresAt` as an ISO string when available.
    const expiresAtRaw = (result as { expiresAt?: string }).expiresAt;
    const expiresAt = expiresAtRaw
      ? new Date(expiresAtRaw)
      : new Date(clock.now().getTime() + 60 * 60 * 1000); // fallback: +1 h

    return { token: result.token, expiresAt };
  } catch (err) {
    if (err instanceof MintFailureError) throw err;

    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (
      lower.includes('enotfound') ||
      lower.includes('econnrefused') ||
      lower.includes('network') ||
      lower.includes('etimedout') ||
      lower.includes('connect')
    ) {
      throw new MintFailureError('network', `[sync-engine] Network error minting token: ${msg}`, err);
    }

    // HTTP 4xx — config / auth issue
    if (/\b4\d\d\b/.test(lower)) {
      throw new MintFailureError('http-4xx', `[sync-engine] HTTP 4xx error minting token: ${msg}`, err);
    }

    // HTTP 5xx — server side
    if (/\b5\d\d\b/.test(lower)) {
      throw new MintFailureError('http-5xx', `[sync-engine] HTTP 5xx error minting token: ${msg}`, err);
    }

    throw new MintFailureError('unknown', `[sync-engine] Unknown error minting token: ${msg}`, err);
  }
}
