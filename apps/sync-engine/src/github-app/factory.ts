import { loadPrivateKey } from './private-key-loader.js';
import { mintInstallationToken } from './octokit-minter.js';
import { createInstallationTokenCache } from './installation-token-cache.js';
import { defaultClock } from './clock.js';
import type { GitCredentialProvider } from './types.js';
import type { GithubAppRuntimeConfig } from '../types.js';

export type { GithubAppRuntimeConfig };

/**
 * Factory: loads the private key eagerly (so misconfiguration fails at startup),
 * wires the minter, and returns a `GitCredentialProvider` backed by the
 * installation-token cache.
 *
 * Does NOT call the network at construction time.
 */
export function createGitCredentialProvider(opts: {
  githubApp: GithubAppRuntimeConfig;
  clock?: typeof defaultClock;
}): GitCredentialProvider {
  const { githubApp, clock = defaultClock } = opts;

  // Eager key load — throws MintFailureError{reason:'config'} on failure
  const privateKey = loadPrivateKey({
    privateKey: githubApp.privateKey,
    privateKeyPath: githubApp.privateKeyPath,
  });

  const credentials = {
    appId: githubApp.appId,
    installationId: githubApp.installationId,
    privateKey,
  };

  return createInstallationTokenCache({
    minter: () => mintInstallationToken({ credentials, clock }),
    clock,
  });
}
