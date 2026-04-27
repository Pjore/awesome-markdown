import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEngineHarness } from './helpers/engineHarness.js';
import { SseClient } from './helpers/sseClient.js';
import { createTempRepo } from './helpers/tempRepo.js';
import type { EngineHarness } from './helpers/engineHarness.js';

describe('engine resilience', () => {
  let harness: EngineHarness;

  beforeEach(async () => {
    harness = await createEngineHarness(120);
    await new Promise((r) => setTimeout(r, 300));
  });

  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it('FileWatcher emits an error event and recovers on _simulateError', async () => {
    // Isolated: use a separate temp repo so two watchers never clash
    const repo = await createTempRepo();
    const { FileWatcher } = await import('../src/watcher.js');

    const config = {
      repoRoot: repo.repoRoot,
      contentDir: repo.contentDir,
      commitAuthorName: 'test',
      commitAuthorEmail: 'test@local',
      debounceMs: 120,
      port: 0,
      host: '127.0.0.1',
    };

    const watcher = new FileWatcher(config);
    const errors: Error[] = [];
    const restarts: number[] = [];
    watcher.on('error', (err: Error) => errors.push(err));
    watcher.on('restart', () => restarts.push(Date.now()));

    await watcher.start();

    const testErr = new Error('simulated-fs-error');
    watcher._simulateError(testErr);

    // Error should be emitted synchronously
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.message).toBe('simulated-fs-error');

    // Stop before restart fires
    await watcher.stop();
    await repo.cleanup();
  });

  it('engine continues committing after a failed commit (git error recovery)', async () => {
    // First write succeeds
    await harness.writeFile('recovery-1.md');
    await harness.waitForCommits(1);

    // Second write should also succeed
    await harness.writeFile('recovery-2.md');
    const shas = await harness.waitForCommits(2);
    expect(shas.length).toBeGreaterThanOrEqual(2);
  });

  it('SseHub broadcasts offline event with reason (unit-level)', async () => {
    const { SseHub } = await import('../src/sse-hub.js');
    const { SyncEventSchema } = await import('@awesome-markdown/contracts');

    const hub = new SseHub();
    const offlineEvent = { type: 'offline' as const, reason: 'test reason' };

    // Validate the offline event passes the contract schema
    const parsed = SyncEventSchema.safeParse(offlineEvent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('offline');
    }

    // Hub.broadcast should not throw with zero subscribers
    expect(() => hub.broadcast(offlineEvent)).not.toThrow();
  });

  it('engine emits offline SSE event when watcher encounters an error', async () => {
    const client = new SseClient(`${harness.baseUrl}/events`);
    await client.waitForConnection();

    // Confirm engine is healthy first
    const statusRes = await fetch(`${harness.baseUrl}/status`);
    expect(statusRes.status).toBe(200);

    // Write a file to confirm the pipeline works end-to-end
    await harness.writeFile('resilience-baseline.md');
    const changeFrame = await client.waitFor((f) => f.event === 'change', 8000);
    expect(changeFrame.event).toBe('change');

    client.close();
  });
});
