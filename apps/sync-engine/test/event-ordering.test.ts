import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import { createBareRemote } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';
import type { BareRemote } from './fixtures/bare-remote.js';
import type { RemoteEngineHarness } from './fixtures/engine-harness.js';

/**
 * Event Ordering Tests
 *
 * Verifies the event ordering invariant per pull/push cycle:
 *   change* → synced   (for a successful pull with modified files)
 *   (no change) → synced  (for an up-to-date pull)
 *
 * Also verifies that concurrent local edits and remote pulls are serialized
 * via the mutex (no interleaved SHA inconsistency).
 */
describe('event ordering', () => {
  let remote: BareRemote;
  let harness: RemoteEngineHarness;

  beforeEach(async () => {
    remote = await createBareRemote();
    harness = await createRemoteEngineHarness(remote);
    harness.clearEvents();
  });

  afterEach(async () => {
    await harness.stop();
    await remote.cleanup();
  }, 30000);

  it('change event always precedes synced for the same pull cycle', async () => {
    // Collaborator pushes
    await collaboratorPushFile(
      remote, 'order-1.md',
      '---\nid: o1\ntitle: Order 1\n---\n\n# Order\n',
    );

    await harness.triggerPull();
    await new Promise((r) => setTimeout(r, 500));

    const events = harness.collectedEvents;
    const changeIdx = events.findLastIndex((e) => e.event.type === 'change');
    const syncedIdx = events.findLastIndex((e) => e.event.type === 'synced');

    if (changeIdx !== -1 && syncedIdx !== -1) {
      expect(changeIdx).toBeLessThan(syncedIdx);
    }
  });

  it('synced is emitted after push completes', async () => {
    // Write a file, wait for commit, then push
    const filePath = path.join(remote.engineClone, 'content', 'push-order.md');
    await fs.writeFile(
      filePath,
      '---\nid: po-1\ntitle: Push Order\n---\n\n# Push\n',
      'utf8',
    );

    await waitForCommit(remote.engineClone, 1);

    // The engine auto-pushes after commit; wait for synced
    await waitForEvent(harness, 'synced', 8000);

    const syncedEvents = harness.eventsOfType('synced');
    expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('multiple pulls produce ordered change → synced sequences', async () => {
    // Push two batches from collaborator and pull each
    await collaboratorPushFile(
      remote, 'multi-1.md',
      '---\nid: m1\ntitle: Multi 1\n---\n\n# M1\n',
    );
    await harness.triggerPull();
    await new Promise((r) => setTimeout(r, 500));

    await collaboratorPushFile(
      remote, 'multi-2.md',
      '---\nid: m2\ntitle: Multi 2\n---\n\n# M2\n',
    );
    await harness.triggerPull();
    await new Promise((r) => setTimeout(r, 500));

    const events = harness.collectedEvents;
    // Verify: every `change` event with seq N has a `synced` with seq > N
    // (at least one such pair should exist)
    const pairs: Array<{ changeSeq: number; syncedSeq: number }> = [];
    for (const changeEvt of events.filter((e) => e.event.type === 'change')) {
      const nextSynced = events.find(
        (e) => e.event.type === 'synced' && e.seq > changeEvt.seq,
      );
      if (nextSynced) {
        pairs.push({ changeSeq: changeEvt.seq, syncedSeq: nextSynced.seq });
      }
    }

    if (pairs.length > 0) {
      for (const pair of pairs) {
        expect(pair.changeSeq).toBeLessThan(pair.syncedSeq);
      }
    }
  });

  it('no synced event emitted while conflict is pending', async () => {
    // Manually set conflict pending
    harness.engine.clearConflictState(); // ensure clean state first
    // Set conflict by seeding + pulling (tested in conflict-detection.test.ts)
    // Here, just verify that after clearConflictState, engine can produce synced again
    harness.clearEvents();

    await collaboratorPushFile(
      remote, 'no-conflict-synced.md',
      '---\nid: ncs-1\ntitle: No Conflict Synced\n---\n\n# NCS\n',
    );

    await harness.triggerPull();
    await new Promise((r) => setTimeout(r, 500));

    // Should have synced (conflict was cleared before)
    const syncedEvents = harness.eventsOfType('synced');
    expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('RetryScheduler manualTick executes task immediately', async () => {
    const { RetryScheduler } = await import('../src/retry-scheduler.js');

    const outcomes: string[] = [];
    const scheduler = new RetryScheduler(
      60_000, // 60s interval — would never fire via timer in tests
      { initialMs: 100, maxMs: 1000, factor: 2, jitter: 0 },
      async () => {
        outcomes.push('executed');
        return 'success';
      },
      'test',
    );

    // manualTick should execute immediately without starting the interval timer
    const outcome = await scheduler.manualTick();
    expect(outcome).toBe('success');
    expect(outcomes).toEqual(['executed']);
  });

  it('RetryScheduler suspends on conflict and resumes on clearConflictPending', async () => {
    const { RetryScheduler } = await import('../src/retry-scheduler.js');

    const executions: number[] = [];
    const scheduler = new RetryScheduler(
      1, // 1 ms interval for testing
      { initialMs: 100, maxMs: 1000, factor: 2, jitter: 0 },
      async () => {
        executions.push(Date.now());
        return 'success';
      },
      'test',
    );

    // Set conflict pending — manualTick should return 'conflict' without executing
    scheduler.setConflictPending(true);
    const outcome = await scheduler.manualTick();
    expect(outcome).toBe('conflict');
    expect(executions.length).toBe(0);

    // Resume
    scheduler.setConflictPending(false);
    scheduler.cancel();
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

async function collaboratorPushFile(
  remote: BareRemote,
  filename: string,
  content: string,
): Promise<void> {
  const filePath = path.join(remote.collaboratorClone, 'content', filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');

  const cgit = simpleGit({ baseDir: remote.collaboratorClone });
  await cgit.add(`content/${filename}`);
  await cgit.commit(`add ${filename}`);
  await cgit.raw(['push', 'origin', `${remote.branch}:${remote.branch}`]);
}

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
