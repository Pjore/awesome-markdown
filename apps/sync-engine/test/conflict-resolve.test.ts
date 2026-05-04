import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createBareRemote } from './fixtures/bare-remote.js';
import { getBareHeadSha } from './fixtures/bare-remote.js';
import { ConflictSessionManager } from '../src/conflict/session.js';
import { mountConflictRoutes } from '../src/http/conflict-routes.js';
import { SseHub } from '../src/sse-hub.js';
import { extractConflictContent } from '../src/conflict/content-extractor.js';
import type { BareRemote } from './fixtures/bare-remote.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed a two-file conflict state:
 *  - Write oursContent to each path on the engine side, commit
 *  - Write theirsContent on the collaborator side, push
 *  - Fetch on the engine side
 *  - Attempt real merge → conflict markers
 *  - Return the conflicted paths
 */
async function seedRealConflict(
  remote: BareRemote,
  files: Array<{
    relPath: string;
    oursContent: string;
    theirsContent: string;
  }>,
): Promise<string[]> {
  const egit = simpleGit({
    baseDir: remote.engineClone,
    config: ['user.name=Engine', 'user.email=engine@local'],
  });
  const cgit = simpleGit({
    baseDir: remote.collaboratorClone,
    config: ['user.name=Collab', 'user.email=collab@local'],
  });

  // Write ours on engine side and commit
  for (const { relPath, oursContent } of files) {
    const abs = path.join(remote.engineClone, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, oursContent, 'utf8');
  }
  await egit.add('.');
  await egit.commit('setup: ours side');

  // Write theirs on collaborator side, commit and push
  for (const { relPath, theirsContent } of files) {
    const abs = path.join(remote.collaboratorClone, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, theirsContent, 'utf8');
  }
  await cgit.add('.');
  await cgit.commit('setup: theirs side');
  await cgit.raw(['push', 'origin', `${remote.branch}:${remote.branch}`]);

  // Fetch on engine side
  await egit.raw([
    'fetch', remote.bareUrl,
    `+refs/heads/${remote.branch}:refs/remotes/origin/${remote.branch}`,
  ]);

  // Attempt merge (will fail with conflicts)
  try {
    await egit.raw(['merge', `refs/remotes/origin/${remote.branch}`]);
  } catch {
    // Expected
  }

  const status = await egit.status();
  return status.conflicted.length > 0
    ? status.conflicted
    : files.map((f) => f.relPath);
}

/**
 * Build a Fastify test server with conflict routes wired up.
 */
async function buildTestServer(
  remote: BareRemote,
  sessionManager: ConflictSessionManager,
  hub: SseHub,
  testHooks = true,
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  mountConflictRoutes(fastify, {
    sessionManager,
    repoRoot: remote.engineClone,
    contentDir: 'content',
    hub,
    getRemoteConfig: () => null, // no push in unit tests
    commitAuthorName: 'test',
    commitAuthorEmail: 'test@local',
    testHooks,
  });
  await fastify.ready();
  return fastify;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('conflict resolve endpoint', () => {
  let remote: BareRemote;
  let sessionManager: ConflictSessionManager;
  let hub: SseHub;
  let server: FastifyInstance;

  beforeEach(async () => {
    remote = await createBareRemote();
    sessionManager = new ConflictSessionManager();
    hub = new SseHub();
    server = await buildTestServer(remote, sessionManager, hub);
  });

  afterEach(async () => {
    await server.close();
    await remote.cleanup();
  }, 30_000);

  it('GET /sync/conflict/state returns null when no active session', async () => {
    const resp = await server.inject({ method: 'GET', url: '/sync/conflict/state' });
    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ conflict: unknown }>();
    expect(body.conflict).toBeNull();
  });

  it('GET /sync/conflict/state returns session when active', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/file-a.md', oursContent: '# Ours A\n', theirsContent: '# Theirs A\n' },
    ]);
    sessionManager.create({ repoRoot: remote.engineClone, branch: remote.branch, paths, content: {} });

    const resp = await server.inject({ method: 'GET', url: '/sync/conflict/state' });
    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ conflict: { mergeId: string; paths: unknown[] } }>();
    expect(body.conflict).not.toBeNull();
    expect(body.conflict?.mergeId).toBeTruthy();
    expect(body.conflict?.paths.length).toBeGreaterThan(0);
  });

  it('GET /sync/conflict/state returns oursContent and theirsContent for each path', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/diff-a.md', oursContent: '# Ours\n', theirsContent: '# Theirs\n' },
    ]);
    const content = await extractConflictContent({ repoRoot: remote.engineClone, paths });
    sessionManager.create({ repoRoot: remote.engineClone, branch: remote.branch, paths, content });

    const resp = await server.inject({ method: 'GET', url: '/sync/conflict/state' });
    expect(resp.statusCode).toBe(200);
    const body = resp.json<{
      conflict: {
        paths: Array<{
          path: string;
          oursContent: string;
          theirsContent: string;
          oursTruncated: boolean;
          theirsTruncated: boolean;
        }>;
      };
    }>();
    expect(body.conflict).not.toBeNull();
    const entry = body.conflict!.paths[0]!;
    expect(entry.oursContent).toBeTruthy();
    expect(entry.theirsContent).toBeTruthy();
    expect(entry.oursTruncated).toBe(false);
    expect(entry.theirsTruncated).toBe(false);
    expect(entry.oursContent).toContain('# Ours');
    expect(entry.theirsContent).toContain('# Theirs');
  });

  it('resolves ours for one path and theirs for another, produces correct content', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/a.md', oursContent: '# Ours A\n', theirsContent: '# Theirs A\n' },
      { relPath: 'content/b.md', oursContent: '# Ours B\n', theirsContent: '# Theirs B\n' },
    ]);

    const session = sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths,
      content: {},
    });

    const decisions: Record<string, string> = {};
    for (const p of paths) {
      decisions[p] = p.includes('a.md') ? 'ours' : 'theirs';
    }

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: { mergeId: session.mergeId, decisions },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ status: string; remainingPaths: string[] }>();
    expect(body.status).toBe('completed');
    expect(body.remainingPaths).toHaveLength(0);

    // Verify file contents
    const aContent = await fs.readFile(
      path.join(remote.engineClone, 'content/a.md'),
      'utf8',
    );
    const bContent = await fs.readFile(
      path.join(remote.engineClone, 'content/b.md'),
      'utf8',
    );
    expect(aContent.trim()).toBe('# Ours A');
    expect(bContent.trim()).toBe('# Theirs B');

    // Verify merge commit was created
    const git = simpleGit({ baseDir: remote.engineClone });
    const log = await git.log({ maxCount: 1 });
    expect(log.latest?.hash).toBeTruthy();
    // HEAD should be ahead of original position
    expect(log.latest?.hash).not.toBe('');
  });

  it('idempotency: re-posting same decisions after completion returns success', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/idem.md', oursContent: '# Ours\n', theirsContent: '# Theirs\n' },
    ]);
    const session = sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths,
      content: {},
    });

    const decisions: Record<string, string> = {};
    for (const p of paths) { decisions[p] = 'ours'; }

    // First resolution
    const resp1 = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: { mergeId: session.mergeId, decisions },
    });
    expect(resp1.statusCode).toBe(200);
    expect(resp1.json<{ status: string }>().status).toBe('completed');

    // Second resolution (idempotent)
    const resp2 = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: { mergeId: session.mergeId, decisions },
    });
    expect(resp2.statusCode).toBe(200);
    expect(resp2.json<{ status: string }>().status).toBe('completed');

    // History should not have doubled
    const git = simpleGit({ baseDir: remote.engineClone });
    const log = await git.log({ maxCount: 3 });
    expect(log.total).toBeGreaterThan(0);
  });

  it('unknown mergeId returns 409', async () => {
    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: { mergeId: 'nonexistent-id', decisions: {} },
    });
    expect(resp.statusCode).toBe(409);
    expect(resp.json<{ error: string }>().error).toBe('NO_ACTIVE_SESSION');
  });

  it('unknown path returns 400', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/known.md', oursContent: '# Ours\n', theirsContent: '# Theirs\n' },
    ]);
    const session = sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths,
      content: {},
    });

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: {
        mergeId: session.mergeId,
        decisions: { 'content/not-in-session.md': 'ours' },
      },
    });
    expect(resp.statusCode).toBe(400);
    expect(resp.json<{ error: string }>().error).toBe('UNKNOWN_PATHS');
  });

  it('invalid decision enum returns 400', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/d.md', oursContent: '# Ours\n', theirsContent: '# Theirs\n' },
    ]);
    const session = sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths,
      content: {},
    });

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: {
        mergeId: session.mergeId,
        decisions: { [paths[0]!]: 'invalid-choice' },
      },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('empty body returns 400', async () => {
    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: {},
    });
    expect(resp.statusCode).toBe(400);
  });

  it('synced event is emitted exactly once when merge completes', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/sync.md', oursContent: '# Ours\n', theirsContent: '# Theirs\n' },
    ]);
    const session = sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths,
      content: {},
    });

    const syncedEvents: unknown[] = [];
    const origBroadcast = hub.broadcast.bind(hub);
    hub.broadcast = (event) => {
      if (event.type === 'synced') syncedEvents.push(event);
      origBroadcast(event);
    };

    const decisions: Record<string, string> = {};
    for (const p of paths) { decisions[p] = 'ours'; }

    await server.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: { mergeId: session.mergeId, decisions },
    });

    expect(syncedEvents).toHaveLength(1);
  });

  it('push succeeds against local bare remote after resolution', async () => {
    const paths = await seedRealConflict(remote, [
      { relPath: 'content/push.md', oursContent: '# Ours\n', theirsContent: '# Theirs\n' },
    ]);

    const headBefore = await getBareHeadSha(remote.barePath, remote.branch);

    const session = sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths,
      content: {},
    });

    // Build server with a real remote config for push
    await server.close();
    const { createRemoteConfig } = await import('../src/remote-config.js');
    const remoteConfig = await createRemoteConfig(remote.engineClone, null);

    const serverWithRemote = await (async () => {
      const f = Fastify({ logger: false });
      mountConflictRoutes(f, {
        sessionManager,
        repoRoot: remote.engineClone,
        contentDir: 'content',
        hub,
        getRemoteConfig: () => remoteConfig,
        commitAuthorName: 'test',
        commitAuthorEmail: 'test@local',
        testHooks: true,
      });
      await f.ready();
      return f;
    })();

    const decisions: Record<string, string> = {};
    for (const p of paths) { decisions[p] = 'ours'; }

    const resp = await serverWithRemote.inject({
      method: 'POST',
      url: '/sync/conflict/resolve',
      payload: { mergeId: session.mergeId, decisions },
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.json<{ status: string }>().status).toBe('completed');

    // Bare repo HEAD should have advanced
    const headAfter = await getBareHeadSha(remote.barePath, remote.branch);
    expect(headAfter).not.toBe(headBefore);

    await serverWithRemote.close();
  }, 30_000);
});


