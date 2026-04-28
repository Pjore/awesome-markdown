import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGitHubSignature } from '../src/http/webhook-signature.js';

// ---------------------------------------------------------------------------
// Test fixtures — computed once, used as the source of truth
// ---------------------------------------------------------------------------

const SECRET = 'test-webhook-secret-abc123';
const BODY = Buffer.from(
  JSON.stringify({ ref: 'refs/heads/main', after: 'abc123def456', commits: [] }),
);

function makeSignature(body: Buffer, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyGitHubSignature', () => {
  it('returns true for a valid signature over a known body+secret pair', () => {
    const sig = makeSignature(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('returns false when the body is tampered (different content)', () => {
    const tamperedBody = Buffer.from(JSON.stringify({ ref: 'refs/heads/other' }));
    const sig = makeSignature(BODY, SECRET);
    expect(verifyGitHubSignature(tamperedBody, sig, SECRET)).toBe(false);
  });

  it('returns false when the signature is tampered (last 4 chars flipped)', () => {
    const sig = makeSignature(BODY, SECRET);
    // Replace last 4 chars with zeros to tamper the digest
    const tampered = sig.slice(0, -4) + '0000';
    expect(verifyGitHubSignature(BODY, tampered, SECRET)).toBe(false);
  });

  it('returns false for undefined (missing) header', () => {
    expect(verifyGitHubSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('returns false for empty string header', () => {
    expect(verifyGitHubSignature(BODY, '', SECRET)).toBe(false);
  });

  it('returns false when header has wrong prefix (md5= instead of sha256=)', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyGitHubSignature(BODY, `md5=${hex}`, SECRET)).toBe(false);
  });

  it('returns false for a truncated digest (fewer than 64 hex chars)', () => {
    const sig = makeSignature(BODY, SECRET);
    const truncated = sig.slice(0, -4); // remove last 4 hex chars
    expect(verifyGitHubSignature(BODY, truncated, SECRET)).toBe(false);
  });

  it('returns false for an extended digest (more than 64 hex chars)', () => {
    const sig = makeSignature(BODY, SECRET) + 'aa';
    expect(verifyGitHubSignature(BODY, sig, SECRET)).toBe(false);
  });

  it('returns false for a header with sha256= prefix but non-hex characters', () => {
    // 64 chars, but containing 'g' (invalid hex)
    const badHex = 'g'.repeat(64);
    expect(verifyGitHubSignature(BODY, `sha256=${badHex}`, SECRET)).toBe(false);
  });

  it('returns true for an empty body with a correctly computed signature', () => {
    const emptyBody = Buffer.alloc(0);
    const sig = makeSignature(emptyBody, SECRET);
    expect(verifyGitHubSignature(emptyBody, sig, SECRET)).toBe(true);
  });

  it('handles an empty secret without throwing', () => {
    const emptySecretSig = makeSignature(BODY, '');
    expect(() => verifyGitHubSignature(BODY, emptySecretSig, '')).not.toThrow();
    // Must return true since signature matches the empty-secret HMAC
    expect(verifyGitHubSignature(BODY, emptySecretSig, '')).toBe(true);
  });

  it('does not throw on any malformed input combination', () => {
    const badInputs: Array<[Buffer, string | undefined, string]> = [
      [BODY, undefined, SECRET],
      [BODY, '', SECRET],
      [BODY, 'not-a-signature', SECRET],
      [BODY, 'sha256=gg', SECRET],
      [BODY, 'sha256=', SECRET],
      [Buffer.alloc(0), undefined, ''],
      [BODY, 'sha256=' + 'x'.repeat(64), SECRET],
    ];

    for (const [body, header, secret] of badInputs) {
      expect(() => verifyGitHubSignature(body, header, secret)).not.toThrow();
    }
  });
});
