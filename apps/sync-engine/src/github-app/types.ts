/**
 * Types, interfaces, and error classes for the GitHub App credential module.
 */

/** A GitHub installation access token with its expiry timestamp. */
export type InstallationToken = {
  /** Opaque installation access token. Treat as a secret; never log. */
  token: string;
  /** UTC instant at which the token expires (as returned by GitHub). */
  expiresAt: Date;
};

/** Credentials needed to mint an installation token for a GitHub App. */
export type GithubAppCredentials = {
  /** GitHub App ID (numeric string). */
  appId: string;
  /** Installation ID for the target repository's owner. */
  installationId: string;
  /** PEM-encoded PKCS#1 or PKCS#8 RSA private key. Never log. */
  privateKey: string;
};

/** Provides installation access tokens on demand with transparent caching. */
export interface GitCredentialProvider {
  /**
   * Returns a valid, non-expired installation access token.
   * Internally caches the token; refreshes when within 5 minutes of expiry.
   * Throws `MintFailureError` on any failure.
   */
  getInstallationToken(): Promise<InstallationToken>;
  /**
   * Optional. Clears cached token and any in-flight refresh promise.
   * Call during test teardown and engine shutdown.
   */
  dispose?(): void;
}

/** Categories of failure when minting an installation token. */
export type MintFailureReason = 'config' | 'network' | 'http-4xx' | 'http-5xx' | 'unknown';

/** Thrown by the credential provider when minting fails. */
export class MintFailureError extends Error {
  readonly reason: MintFailureReason;

  constructor(reason: MintFailureReason, message: string, cause?: unknown) {
    super(message);
    this.name = 'MintFailureError';
    this.reason = reason;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
