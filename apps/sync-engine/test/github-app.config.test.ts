import { describe, it, expect } from 'vitest';
import { EngineConfigSchema } from '../src/config.schema.js';

const VALID_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';

/** Build a minimal valid base input (local-only) that Zod can parse. */
function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    repoRoot: '/',
    ...overrides,
  };
}

/** Build a valid githubApp block. */
function validApp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appId: '12345',
    installationId: '67890',
    privateKey: VALID_PRIVATE_KEY,
    privateKeyPath: null,
    webhookSecret: null,
    ...overrides,
  };
}

describe('githubApp config schema', () => {
  it('accepts valid githubApp config with inline key', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({ githubApp: validApp() }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts valid githubApp config with key path', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({
        githubApp: validApp({ privateKey: null, privateKeyPath: '/path/to/key.pem' }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects missing appId', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({
        githubApp: validApp({ appId: '' }),
      }),
    );
    expect(result.success).toBe(false);
    const msgs = result.success ? '' : result.error.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/GITHUB_APP_ID/);
  });

  it('rejects missing installationId', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({
        githubApp: validApp({ installationId: '' }),
      }),
    );
    expect(result.success).toBe(false);
    const msgs = result.success ? '' : result.error.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/GITHUB_APP_INSTALLATION_ID/);
  });

  it('rejects when both privateKey and privateKeyPath are set', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({
        githubApp: validApp({ privateKeyPath: '/path/to/key.pem' }),
      }),
    );
    expect(result.success).toBe(false);
    const msgs = result.success ? '' : result.error.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/GITHUB_APP_PRIVATE_KEY/);
  });

  it('rejects when neither privateKey nor privateKeyPath is set', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({
        githubApp: validApp({ privateKey: null, privateKeyPath: null }),
      }),
    );
    expect(result.success).toBe(false);
    const msgs = result.success ? '' : result.error.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/GITHUB_APP_PRIVATE_KEY/);
  });

  it('rejects remote.enabled=true without githubApp', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({ remote: { enabled: true, pullIntervalMs: 30000, pushTimeoutMs: 15000 } }),
    );
    expect(result.success).toBe(false);
    const msgs = result.success ? '' : result.error.issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/GITHUB_APP_ID/);
  });

  it('accepts local-only operation (remote.enabled=false, no githubApp)', () => {
    const result = EngineConfigSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it('accepts remote.enabled=true when githubApp is fully configured', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({
        remote: { enabled: true, pullIntervalMs: 30000, pushTimeoutMs: 15000 },
        githubApp: validApp(),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts non-empty webhookSecret', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({ githubApp: validApp({ webhookSecret: 'my-secret-value' }) }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts null webhookSecret (webhook feature disabled)', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({ githubApp: validApp({ webhookSecret: null }) }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects empty string webhookSecret (empty webhook secrets are not valid)', () => {
    const result = EngineConfigSchema.safeParse(
      baseInput({ githubApp: validApp({ webhookSecret: '' }) }),
    );
    expect(result.success).toBe(false);
  });
});
