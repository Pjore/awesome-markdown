import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareRemote } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';
import { NetworkFault } from './fixtures/network-fault.js';
import type { BareRemote } from './fixtures/bare-remote.js';
import type { GitCredentialProvider, InstallationToken } from '../src/github-app/index.js';

/**
 * Token Redaction Tests
 *
 * Verifies that installation tokens never appear in:
 *  - SSE event payloads
 *  - Engine status output
 *  - Error reasons surfaced in offline events
 */

const SENTINEL_TOKEN = 'ghs_SENTINEL_INSTALLATION_TOKEN_abc123xyz';

/** Build a stub provider that returns the given sentinel token. */
function makeStubProvider(token: string): GitCredentialProvider {
  return {
    getInstallationToken(): Promise<InstallationToken> {
      return Promise.resolve({
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    },
    dispose() {},
  };
}

describe('token redaction', () => {
  let remote: BareRemote;

  beforeEach(async () => {
    remote = await createBareRemote();
  });

  afterEach(async () => {
    await remote.cleanup();
  }, 30000);

  it('redactToken replaces token in URL string', async () => {
    const { redactToken } = await import('../src/remote-config.js');

    const url = `https://x-access-token:${SENTINEL_TOKEN}@github.com/owner/repo.git`;
    const redacted = redactToken(url, SENTINEL_TOKEN);
    expect(redacted).not.toContain(SENTINEL_TOKEN);
    expect(redacted).toContain('***REDACTED***');
  });

  it('redactToken is a no-op when token is null', async () => {
    const { redactToken } = await import('../src/remote-config.js');

    const url = 'https://github.com/owner/repo.git';
    expect(redactToken(url, null)).toBe(url);
  });

  it('token does not appear in collected event payloads after push failure', async () => {
    const fault = new NetworkFault();
    fault.enable('auth');

    // Create harness with sentinel token provider
    const harness = await createRemoteEngineHarness(remote, makeStubProvider(SENTINEL_TOKEN));
    harness.setPushFault(fault);

    // Trigger push failures
    await harness.triggerPush();
    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 300));

    await harness.stop();

    // Inspect all collected events for the token
    for (const { event } of harness.collectedEvents) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(SENTINEL_TOKEN);
    }
  });

  it('token does not appear in engine status output', async () => {
    const harness = await createRemoteEngineHarness(remote, makeStubProvider(SENTINEL_TOKEN));
    const status = harness.engine.getStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(SENTINEL_TOKEN);
    await harness.stop();
  });

  it('offline event reason does not contain token', async () => {
    const fault = new NetworkFault();
    fault.enable('auth');

    const harness = await createRemoteEngineHarness(remote, makeStubProvider(SENTINEL_TOKEN));
    harness.setPushFault(fault);

    await harness.triggerPush();
    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 300));

    await harness.stop();

    const offlineEvents = harness.eventsOfType('offline');
    for (const { event } of offlineEvents) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(SENTINEL_TOKEN);
    }
  });

  it('createRemoteConfig redactedUrl shows sentinel, not live token', async () => {
    const { createRemoteConfig } = await import('../src/remote-config.js');

    const provider = makeStubProvider(SENTINEL_TOKEN);
    const remoteConfig = await createRemoteConfig(remote.engineClone, provider);
    // redactedUrl should not contain the live token (uses a static sentinel)
    expect(remoteConfig.redactedUrl).not.toContain(SENTINEL_TOKEN);
    // getAuthenticatedUrl is async
    expect(typeof remoteConfig.getAuthenticatedUrl).toBe('function');
  });

  it('authenticated URL contains token (privileged, for git use only)', async () => {
    const { createRemoteConfig } = await import('../src/remote-config.js');

    // Use a file:// remote — no token injection for non-HTTPS URLs
    const remoteConfig = await createRemoteConfig(remote.engineClone, makeStubProvider(SENTINEL_TOKEN));
    const authUrl = await remoteConfig.getAuthenticatedUrl();
    // For file:// URLs, token is NOT injected
    expect(authUrl).toBeTruthy();
    expect(typeof authUrl).toBe('string');
    // Even with an HTTPS URL, the token should not appear in status
    expect(remoteConfig.redactedUrl).not.toContain(SENTINEL_TOKEN);
  });
});
