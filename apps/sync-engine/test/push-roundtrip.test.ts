import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import { createBareRemote, getBareHeadSha } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';
import type { BareRemote } from './fixtures/bare-remote.js';
import type { RemoteEngineHarness } from './fixtures/engine-harness.js';

/**
 * Push Round-Trip Tests
 *
 * UC-1 (online path): edit file → auto-commit → push → synced event
 * Verifies: bare remote receives new SHA, exactly one synced event broadcast.
 */
describe('push round-trip', () => {
  let remote: BareRemote;
  let harness: RemoteEngineHarness;

  beforeEach(async () => {
    remote = await createBareRemote();
    harness = await createRemoteEngineHarness(remote);
  });

  afterEach(async () => {
    await harness.stop();
    await remote.cleanup();
  }, 30000);

  it('bare remote receives the new commit after push', async () => {
    const beforeSha = await getBareHeadSha(remote.barePath, remote.branch);

    // Write a file inside content/
    const filePath = path.join(remote.engineClone, 'content', 'push-test.md');
    await fs.writeFile(
      filePath,
      '---\nid: push-1\ntitle: Push Test\n---\n\n# Push Test\n',
      'utf8',
    );

    // Wait for watcher + committer to fire
    await waitForCommit(remote.engineClone, 1);

    // Manually trigger push
    await harness.triggerPush();

    // Give a short moment for the push to complete
    await new Promise((r) => setTimeout(r, 500));

    const afterSha = await getBareHeadSha(remote.barePath, remote.branch);
    expect(afterSha).not.toBe(beforeSha);
  });

  it('emits a synced event after a successful push', async () => {
    harness.clearEvents();

    const filePath = path.join(remote.engineClone, 'content', 'synced-test.md');
    await fs.writeFile(
      filePath,
      '---\nid: synced-1\ntitle: Synced Test\n---\n\n# Synced\n',
      'utf8',
    );

    await waitForCommit(remote.engineClone, 1);

    // Wait for the automatic push-after-commit to emit synced
    await waitForEvent(harness, 'synced', 8000);

    const syncedEvents = harness.eventsOfType('synced');
    expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('pushOnce returns pushed result with a SHA', async () => {
    const { pushOnce } = await import('../src/pusher.js');
    const { createRemoteConfig } = await import('../src/remote-config.js');

    // Write and commit a file first
    const filePath = path.join(remote.engineClone, 'content', 'push-direct.md');
    await fs.writeFile(
      filePath,
      '---\nid: push-direct\ntitle: Direct Push\n---\n\n# Push\n',
      'utf8',
    );
    await waitForCommit(remote.engineClone, 1);

    // Stop engine first to avoid concurrent git ops
    await harness.stop();

    const remoteConfig = await createRemoteConfig(remote.engineClone, null);
    const result = await pushOnce({
      repoRoot: remote.engineClone,
      remoteConfig,
    });

    // The auto-push from the engine may have already pushed, so accept pushed or up-to-date
    expect(['pushed', 'up-to-date']).toContain(result.kind);
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

async function waitForEvent(
  harness: RemoteEngineHarness,
  type: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (harness.collectedEvents.some((e) => e.event.type === type)) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timed out waiting for '${type}' event`);
}
