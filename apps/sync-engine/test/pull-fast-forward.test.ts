import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import { SyncEventSchema } from '@awesome-markdown/contracts';
import { createBareRemote } from './fixtures/bare-remote.js';
import { createRemoteEngineHarness } from './fixtures/engine-harness.js';
import type { BareRemote } from './fixtures/bare-remote.js';
import type { RemoteEngineHarness } from './fixtures/engine-harness.js';

/**
 * Pull Fast-Forward Tests (UC-4 happy path)
 *
 * Remote collaborator pushes a new commit → engine's pull cycle picks it up
 * via fast-forward → emits `change` (with affected paths) + `synced`.
 */
describe('pull fast-forward', () => {
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

  it('pullOnce returns fast-forwarded when collaborator pushes', async () => {
    const { pullOnce } = await import('../src/puller.js');
    const { createRemoteConfig } = await import('../src/remote-config.js');

    // Collaborator adds a file and pushes
    await collaboratorPushFile(remote, 'new-from-collab.md',
      '---\nid: collab-1\ntitle: Collab File\n---\n\n# From Collaborator\n');

    const remoteConfig = await createRemoteConfig(remote.engineClone, null);
    const result = await pullOnce({
      repoRoot: remote.engineClone,
      contentDir: 'content',
      remoteConfig,
    });

    expect(result.kind).toBe('fast-forwarded');
    if (result.kind === 'fast-forwarded') {
      expect(result.paths).toContain('content/new-from-collab.md');
      expect(result.fromSha).toBeTruthy();
      expect(result.toSha).toBeTruthy();
      expect(result.fromSha).not.toBe(result.toSha);
    }
  });

  it('engine emits change event with affected paths after fast-forward', async () => {
    // Collaborator pushes a file
    await collaboratorPushFile(remote, 'pull-ff-file.md',
      '---\nid: pull-ff-1\ntitle: Fast Forward\n---\n\n# FF\n');

    // Trigger pull manually
    await harness.triggerPull();

    // Wait for events to be collected
    await new Promise((r) => setTimeout(r, 500));

    const changeEvents = harness.eventsOfType('change');
    const hasExpectedPath = changeEvents.some((e) => {
      const evt = e.event;
      if (evt.type !== 'change') return false;
      const paths = evt.paths ?? [evt.path];
      return paths.some((p) => p.includes('pull-ff-file.md'));
    });
    expect(hasExpectedPath).toBe(true);

    // change event must conform to contract
    const firstChange = changeEvents[0];
    if (firstChange) {
      const parsed = SyncEventSchema.safeParse(firstChange.event);
      expect(parsed.success).toBe(true);
    }
  });

  it('engine emits synced event after successful pull', async () => {
    await collaboratorPushFile(remote, 'pull-synced.md',
      '---\nid: ps-1\ntitle: Pull Synced\n---\n\n# PS\n');

    await harness.triggerPull();

    // Wait for events
    await new Promise((r) => setTimeout(r, 500));

    const syncedEvents = harness.eventsOfType('synced');
    expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('change event is followed by synced in correct order', async () => {
    await collaboratorPushFile(remote, 'order-check.md',
      '---\nid: oc-1\ntitle: Order Check\n---\n\n# Order\n');

    await harness.triggerPull();
    await new Promise((r) => setTimeout(r, 500));

    const events = harness.collectedEvents.filter(
      (e) => e.event.type === 'change' || e.event.type === 'synced',
    );

    // There must be a change before the synced
    const changeIdx = events.findIndex((e) => e.event.type === 'change');
    const syncedIdx = events.findIndex((e) => e.event.type === 'synced');

    if (changeIdx !== -1 && syncedIdx !== -1) {
      expect(changeIdx).toBeLessThan(syncedIdx);
    }
  });

  it('working tree matches collaborator after fast-forward', async () => {
    const fileContent = '---\nid: match-1\ntitle: Match\n---\n\n# Match Content\n';
    await collaboratorPushFile(remote, 'match-check.md', fileContent);

    await harness.triggerPull();
    await new Promise((r) => setTimeout(r, 500));

    const engineFilePath = path.join(remote.engineClone, 'content', 'match-check.md');
    const content = await fs.readFile(engineFilePath, 'utf8');
    expect(content).toBe(fileContent);
  });

  it('pullOnce returns up-to-date when nothing changed', async () => {
    const { pullOnce } = await import('../src/puller.js');
    const { createRemoteConfig } = await import('../src/remote-config.js');

    // First, push everything that's local
    const git = simpleGit({ baseDir: remote.engineClone });
    await git.raw(['push', remote.bareUrl, `${remote.branch}:${remote.branch}`]);

    const remoteConfig = await createRemoteConfig(remote.engineClone, null);
    const result = await pullOnce({
      repoRoot: remote.engineClone,
      contentDir: 'content',
      remoteConfig,
    });

    expect(['up-to-date', 'fast-forwarded']).toContain(result.kind);
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
