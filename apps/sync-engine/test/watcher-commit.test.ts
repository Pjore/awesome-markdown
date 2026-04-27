import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEngineHarness } from './helpers/engineHarness.js';
import { simpleGit } from 'simple-git';
import type { EngineHarness } from './helpers/engineHarness.js';

describe('watcher → commit (create / modify / delete)', () => {
  let harness: EngineHarness;

  beforeEach(async () => {
    harness = await createEngineHarness(120);
    // Allow chokidar to finish its initial scan
    await new Promise((r) => setTimeout(r, 300));
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('creates a commit when a new file is added to content/', async () => {
    await harness.writeFile('new-item.md');

    const shas = await harness.waitForCommits(1);
    expect(shas.length).toBeGreaterThanOrEqual(1);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 2 });
    const latest = log.latest;
    expect(latest).toBeDefined();
    expect(latest!.message).toContain('[sync-engine]');
    expect(latest!.message).toContain('1 file(s)');
  });

  it('creates a commit when an existing file is modified', async () => {
    // First, write and wait for initial commit of a new file
    await harness.writeFile('modify-target.md', '---\nid: t1\n---\n# v1\n');
    await harness.waitForCommits(1);

    // Now modify it
    await harness.writeFile('modify-target.md', '---\nid: t1\n---\n# v2\n');
    const shas = await harness.waitForCommits(2);
    expect(shas.length).toBeGreaterThanOrEqual(2);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 1 });
    expect(log.latest!.message).toContain('[sync-engine]');
  });

  it('creates a commit when a file is deleted from content/', async () => {
    await harness.writeFile('delete-me.md');
    await harness.waitForCommits(1);

    await harness.deleteFile('delete-me.md');
    const shas = await harness.waitForCommits(2);
    expect(shas.length).toBeGreaterThanOrEqual(2);
  });

  it('includes affected relative paths in the commit message body', async () => {
    await harness.writeFile('path-check.md');
    await harness.waitForCommits(1);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 1 });
    const body = log.latest!.body;
    expect(body).toContain('content/path-check.md');
  });

  it('includes source classification in the commit message', async () => {
    await harness.writeFile('source-check.md');
    await harness.waitForCommits(1);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 1 });
    const body = log.latest!.body;
    // Default classification is 'external' (no markSelfWrite called)
    expect(body).toMatch(/Source: (self|external|mixed)/);
  });

  it('includes a Batch-Id trailer in the commit message', async () => {
    await harness.writeFile('batch-id-check.md');
    await harness.waitForCommits(1);

    const git = simpleGit({ baseDir: harness.repoRoot });
    const log = await git.log({ maxCount: 1 });
    expect(log.latest!.body).toContain('Batch-Id:');
  });
});
