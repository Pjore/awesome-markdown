import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPrivateKey } from '../src/github-app/private-key-loader.js';
import { MintFailureError } from '../src/github-app/types.js';

const INLINE_PEM = '-----BEGIN RSA PRIVATE KEY-----\nfake_key_data\n-----END RSA PRIVATE KEY-----';

describe('private-key-loader', () => {
  it('returns inline PEM verbatim when privateKey is set', () => {
    const result = loadPrivateKey({ privateKey: INLINE_PEM, privateKeyPath: null });
    expect(result).toBe(INLINE_PEM);
  });

  it('reads PEM from file when privateKeyPath is set', () => {
    const dir = join(tmpdir(), `pem-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const keyPath = join(dir, 'private-key.pem');
    writeFileSync(keyPath, INLINE_PEM, 'utf8');
    try {
      const result = loadPrivateKey({ privateKey: null, privateKeyPath: keyPath });
      expect(result).toBe(INLINE_PEM);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws MintFailureError{reason:config} when file is not found', () => {
    const missingPath = join(tmpdir(), 'does-not-exist-99999.pem');
    expect(() =>
      loadPrivateKey({ privateKey: null, privateKeyPath: missingPath }),
    ).toThrow(MintFailureError);

    try {
      loadPrivateKey({ privateKey: null, privateKeyPath: missingPath });
    } catch (err) {
      expect(err).toBeInstanceOf(MintFailureError);
      expect((err as MintFailureError).reason).toBe('config');
      // Message should name the path, not the key contents
      expect((err as MintFailureError).message).toContain(missingPath);
    }
  });

  it('throws MintFailureError{reason:config} when both key and path are absent', () => {
    expect(() =>
      loadPrivateKey({ privateKey: null, privateKeyPath: null }),
    ).toThrow(MintFailureError);

    try {
      loadPrivateKey({ privateKey: null, privateKeyPath: null });
    } catch (err) {
      expect((err as MintFailureError).reason).toBe('config');
    }
  });

  it('throws MintFailureError{reason:config} when privateKeyPath is undefined', () => {
    expect(() =>
      loadPrivateKey({ privateKey: undefined, privateKeyPath: undefined }),
    ).toThrow(MintFailureError);
  });
});
