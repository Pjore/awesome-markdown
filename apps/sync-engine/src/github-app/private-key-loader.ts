import { readFileSync } from 'node:fs';
import { MintFailureError } from './types.js';

/**
 * Resolve the PEM private key from either an inline string or a file path.
 * Throws `MintFailureError` with `reason: 'config'` when the key is unreadable.
 */
export function loadPrivateKey(opts: {
  privateKey: string | null | undefined;
  privateKeyPath: string | null | undefined;
}): string {
  const { privateKey, privateKeyPath } = opts;

  if (privateKey) {
    return privateKey;
  }

  if (privateKeyPath) {
    try {
      return readFileSync(privateKeyPath, 'utf8');
    } catch (err) {
      throw new MintFailureError(
        'config',
        `[sync-engine] Cannot read GitHub App private key from path: ${privateKeyPath}`,
        err,
      );
    }
  }

  throw new MintFailureError(
    'config',
    '[sync-engine] GitHub App private key is not configured. ' +
      'Set GITHUB_APP_PRIVATE_KEY (inline PEM) or GITHUB_APP_PRIVATE_KEY_PATH (file path).',
  );
}
