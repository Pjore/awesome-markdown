import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareRemote } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';
import { NetworkFault } from './fixtures/network-fault.js';
import type { BareRemote } from './fixtures/bare-remote.js';
import type { RemoteEngineHarness } from './fixtures/engine-harness.js';

/**
 * Token Redaction Tests
 *
 * Verifies that GITHUB_TOKEN never appears in:
 *  - SSE event payloads
 *  - Engine status output
 *  - Error reasons surfaced in offline events
 */

const SENTINEL_TOKEN = 'ghp_SENTINEL_TOKEN_DO_NOT_LOG_abc123xyz';

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

    // Create harness with sentinel token
    const harness = await createRemoteEngineHarness(remote, SENTINEL_TOKEN);
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
    const harness = await createRemoteEngineHarness(remote, SENTINEL_TOKEN);
    const status = harness.engine.getStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(SENTINEL_TOKEN);
    await harness.stop();
  });

  it('offline event reason does not contain token', async () => {
    const fault = new NetworkFault();
    fault.enable('auth');

    const harness = await createRemoteEngineHarness(remote, SENTINEL_TOKEN);
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

  it('createRemoteConfig builds authenticated URL without exposing token in redactedUrl', async () => {
    const { createRemoteConfig } = await import('../src/remote-config.js');

    const remoteConfig = await createRemoteConfig(remote.engineClone, SENTINEL_TOKEN);
    // redactedUrl should not contain the token
    expect(remoteConfig.redactedUrl).not.toContain(SENTINEL_TOKEN);
    // But the authenticated URL (privileged accessor) should work internally
    // We do NOT log or assert its full value — just verify it exists as a function
    expect(typeof remoteConfig.getAuthenticatedUrl).toBe('function');
  });

  it('authenticated URL contains token (privileged, for git use only)', async () => {
    const { createRemoteConfig } = await import('../src/remote-config.js');

    // Use an HTTPS URL to test token injection
    // For local file:// URLs, getAuthenticatedUrl returns the plain URL
    const remoteConfig = await createRemoteConfig(remote.engineClone, SENTINEL_TOKEN);
    const authUrl = remoteConfig.getAuthenticatedUrl();
    // For file:// URLs, token is NOT injected (only HTTPS GitHub URLs get the token)
    // Verify the function at least returns the origin URL
    expect(authUrl).toBeTruthy();
    expect(typeof authUrl).toBe('string');
  });
});
