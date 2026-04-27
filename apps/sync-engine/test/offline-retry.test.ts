import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareRemote } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';
import { NetworkFault } from './fixtures/network-fault.js';
import { getBareHeadSha } from './fixtures/bare-remote.js';
import type { BareRemote } from './fixtures/bare-remote.js';
import type { RemoteEngineHarness } from './fixtures/engine-harness.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';

/**
 * Offline / Retry Tests (UC-1 error path, UC-2)
 *
 * - Push fails with network fault → engine emits `offline` (after debounce)
 * - Commit is retained locally
 * - Fault cleared + manual push tick → engine emits `synced`
 * - Bare remote receives the commit
 */
describe('offline retry', () => {
  let remote: BareRemote;
  let harness: RemoteEngineHarness;
  const fault = new NetworkFault();

  beforeEach(async () => {
    remote = await createBareRemote();
    harness = await createRemoteEngineHarness(remote);
    fault.disable();
    harness.clearEvents();
  });

  afterEach(async () => {
    fault.disable();
    await harness.stop();
    await remote.cleanup();
  }, 30000);

  it('NetworkFault.shouldFail() returns true when enabled', () => {
    fault.enable('refused');
    expect(fault.shouldFail()).toBe(true);
    expect(fault.getReason()).toBe('refused');
    fault.disable();
    expect(fault.shouldFail()).toBe(false);
  });

  it('pushOnce returns network-failure when fault is active', async () => {
    const { pushOnce } = await import('../src/pusher.js');
    const { createRemoteConfig } = await import('../src/remote-config.js');

    const localFault = new NetworkFault();
    localFault.enable('refused');

    const remoteConfig = await createRemoteConfig(remote.engineClone, null);
    const result = await pushOnce({
      repoRoot: remote.engineClone,
      remoteConfig,
      fault: localFault,
    });

    expect(result.kind).toBe('network-failure');
    if (result.kind === 'network-failure') {
      expect(result.reason).toBe('refused');
    }
  });

  it('offline state transitions after consecutive failures', async () => {
    const { OfflineState } = await import('../src/offline-state.js');
    const transitions: string[] = [];
    const state = new OfflineState({ consecutiveFailuresForOffline: 2 });
    state.onTransition((t) => transitions.push(t.type));

    // First failure — below threshold
    state.reportFailure('refused');
    expect(transitions).toEqual([]);
    expect(state.isOnline).toBe(true);

    // Second consecutive failure — triggers offline
    state.reportFailure('refused');
    expect(transitions).toContain('went-offline');
    expect(state.isOnline).toBe(false);

    // Recovery
    state.reportSuccess();
    expect(transitions).toContain('recovered');
    expect(state.isOnline).toBe(true);
  });

  it('engine emits offline after repeated push failures', async () => {
    // Inject fault before any push
    harness.setPushFault(fault);
    fault.enable('refused');

    // Write a file to trigger commit + push attempt
    const filePath = path.join(remote.engineClone, 'content', 'offline-test.md');
    await fs.writeFile(
      filePath,
      '---\nid: offline-1\ntitle: Offline\n---\n\n# Offline\n',
      'utf8',
    );

    // Wait for commit
    await waitForCommit(remote.engineClone, 1);

    // Manually trigger push twice (to exceed debounce threshold of 2)
    await harness.triggerPush();
    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 300));

    const offlineEvents = harness.eventsOfType('offline');
    expect(offlineEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('commit is retained locally after push failure', async () => {
    harness.setPushFault(fault);
    fault.enable('refused');

    const filePath = path.join(remote.engineClone, 'content', 'retained.md');
    await fs.writeFile(
      filePath,
      '---\nid: retained-1\ntitle: Retained\n---\n\n# Retained\n',
      'utf8',
    );

    await waitForCommit(remote.engineClone, 1);
    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 300));

    // Local commit should still be there
    const git = simpleGit({ baseDir: remote.engineClone });
    const log = await git.log({ maxCount: 2 });
    const syncCommits = log.all.filter((e) => e.message.includes('[sync-engine]'));
    expect(syncCommits.length).toBeGreaterThanOrEqual(1);
  });

  it('emits synced after fault cleared and push retried', async () => {
    harness.setPushFault(fault);
    fault.enable('refused');

    const filePath = path.join(remote.engineClone, 'content', 'recovery.md');
    await fs.writeFile(
      filePath,
      '---\nid: recovery-1\ntitle: Recovery\n---\n\n# Recovery\n',
      'utf8',
    );

    await waitForCommit(remote.engineClone, 1);

    // Fail twice to trigger offline state
    await harness.triggerPush();
    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 300));

    harness.clearEvents();
    fault.disable();

    // Push should now succeed
    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 500));

    const syncedEvents = harness.eventsOfType('synced');
    expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('bare remote receives the commit after recovery', async () => {
    const beforeSha = await getBareHeadSha(remote.barePath, remote.branch);

    harness.setPushFault(fault);
    fault.enable('refused');

    const filePath = path.join(remote.engineClone, 'content', 'bare-recovery.md');
    await fs.writeFile(
      filePath,
      '---\nid: br-1\ntitle: Bare Recovery\n---\n\n# BR\n',
      'utf8',
    );

    await waitForCommit(remote.engineClone, 1);
    await harness.triggerPush(); // fails
    await new Promise((r) => setTimeout(r, 200));

    fault.disable();
    harness.clearEvents();

    await harness.triggerPush();
    await new Promise((r) => setTimeout(r, 500));

    const afterSha = await getBareHeadSha(remote.barePath, remote.branch);
    expect(afterSha).not.toBe(beforeSha);
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

async function waitForCommit(repoRoot: string, count: number, timeoutMs = 10000): Promise<void> {
  const git = simpleGit({ baseDir: repoRoot });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = await git.log({ maxCount: count + 1 });
    const syncCommits = log.all.filter((e) => e.message.includes('[sync-engine]'));
    if (syncCommits.length >= count) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timed out waiting for ${count} sync-engine commit(s)`);
}
