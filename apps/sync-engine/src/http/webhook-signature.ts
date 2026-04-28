/**
 * GitHub webhook signature verification.
 *
 * Reference: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const SHA256_PREFIX = 'sha256=';
const SHA256_HEX_LENGTH = 64; // 32 bytes × 2 hex chars

/**
 * Verify a GitHub `X-Hub-Signature-256` header against the raw request body.
 *
 * Returns `true` only when all of the following hold:
 * - `signatureHeader` is a non-empty string starting with `sha256=`
 * - The hex portion is exactly 64 characters (32 bytes)
 * - The HMAC-SHA256 of `rawBody` with `secret` matches the header digest (constant-time)
 *
 * Returns `false` for any missing, malformed, or mismatched input.
 * Never throws, never logs, never exposes the secret.
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SHA256_PREFIX)) return false;

  const hexTail = signatureHeader.slice(SHA256_PREFIX.length);
  if (hexTail.length !== SHA256_HEX_LENGTH) return false;

  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const actual = Buffer.from(hexTail, 'hex');
    // Invalid hex produces a shorter buffer — lengths must match for timingSafeEqual
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
