import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEngineHarness } from './helpers/engineHarness.js';
import { simpleGit } from 'simple-git';
import type { EngineHarness } from './helpers/engineHarness.js';

describe('debounce batching', () => {
  let harness: EngineHarness;

  beforeEach(async () => {
    // Use a longer debounce so we can reliably write multiple files before flush
    harness = await createEngineHarness(300);
    // Allow chokidar to finish its initial scan
    await new Promise((r) => setTimeout(r, 400));
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('coalesces N rapid writes into exactly one commit', async () => {
    const names = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];

    // Write all files within the debounce window (no pause between writes)
    for (const name of names) {
      await harness.writeFile(name);
    }

    // Wait for exactly one commit covering all files
    await harness.waitForCommits(1, 12000);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 2 });
    const syncCommits = log.all.filter((e) => e.message.includes('[sync-engine]'));
    expect(syncCommits.length).toBe(1);

    const body = syncCommits[0]!.body;
    for (const name of names) {
      expect(body).toContain(name);
    }
    expect(syncCommits[0]!.message).toContain(`${names.length} file(s)`);
  });

  it('produces two commits for two bursts separated by more than debounceMs', async () => {
    // First burst
    await harness.writeFile('burst1-a.md');
    await harness.writeFile('burst1-b.md');

    // Wait longer than debounceMs (300ms) + some margin before second burst
    await new Promise((r) => setTimeout(r, 600));

    // Second burst
    await harness.writeFile('burst2-a.md');
    await harness.writeFile('burst2-b.md');

    // Wait for two commits
    await harness.waitForCommits(2, 12000);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 5 });
    const syncCommits = log.all.filter((e) => e.message.includes('[sync-engine]'));
    expect(syncCommits.length).toBeGreaterThanOrEqual(2);
  });

  it('drops add-then-delete of the same file within a single debounce window', async () => {
    // Use the Debouncer directly for isolation
    const { Debouncer } = await import('../src/debouncer.js');
    const batches: import('../src/types.js').Batch[] = [];
    const debouncer = new Debouncer(100, (b) => batches.push(b));

    const now = Date.now();
    debouncer.push({ event: 'add', path: '/tmp/content/eph.md', timestamp: now });
    debouncer.push({ event: 'unlink', path: '/tmp/content/eph.md', timestamp: now + 10 });
    // Let the batch flush
    await new Promise((r) => setTimeout(r, 200));

    // The ephemeral file should have been dropped
    expect(batches.length).toBe(0);
  });
});
