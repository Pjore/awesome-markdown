import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createBareRemote } from './fixtures/bare-remote.js';
import { ConflictSessionManager } from '../src/conflict/session.js';
import { mountConflictRoutes } from '../src/http/conflict-routes.js';
import { SseHub } from '../src/sse-hub.js';
import type { BareRemote } from './fixtures/bare-remote.js';

/**
 * Open-External endpoint tests.
 *
 * The actual OS-opener spawn is stubbed so tests don't open real editors.
 */

async function buildTestServer(
  remote: BareRemote,
  sessionManager: ConflictSessionManager,
  hub: SseHub,
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  mountConflictRoutes(fastify, {
    sessionManager,
    repoRoot: remote.engineClone,
    contentDir: 'content',
    hub,
    getRemoteConfig: () => null,
    commitAuthorName: 'test',
    commitAuthorEmail: 'test@local',
    testHooks: false,
  });
  await fastify.ready();
  return fastify;
}

describe('conflict open-external endpoint', () => {
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
    vi.restoreAllMocks();
  }, 30_000);

  it('returns 409 when no active session', async () => {
    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/open',
      payload: { path: 'content/seed.md' },
    });
    expect(resp.statusCode).toBe(409);
    expect(resp.json<{ error: string }>().error).toBe('NO_ACTIVE_SESSION');
  });

  it('returns 400 for unknown path when session is active', async () => {
    sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths: ['content/known.md'],
      content: {},
    });

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/open',
      payload: { path: 'content/unknown.md' },
    });
    expect(resp.statusCode).toBe(400);
    expect(resp.json<{ error: string }>().error).toBe('UNKNOWN_PATH');
  });

  it('rejects path traversal attempts', async () => {
    // Stub the openExternalFile to avoid actually spawning
    vi.mock('../src/conflict/open-external.js', () => ({
      openExternalFile: vi.fn(),
    }));

    sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths: ['../../../etc/passwd'],
      content: {},
    });

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/open',
      payload: { path: '../../../etc/passwd' },
    });
    // Either 400 (path traversal rejected by open-external) or 400 (not in session paths)
    // The path IS in session.paths here so it reaches the open-external check
    expect(resp.statusCode).toBe(400);
  });

  it('records external decision when open succeeds', async () => {
    // Create a real file so openExternalFile passes the existsSync check
    const { writeFile, mkdir } = await import('node:fs/promises');
    const absPath = path.join(remote.engineClone, 'content', 'real-file.md');
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, '# Real file\n', 'utf8');

    sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths: ['content/real-file.md'],
      content: {},
    });

    // openExternalFile spawns+unrefs without waiting — it won't throw in CI
    // even when no real editor is present (spawn failure is async/silent).
    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/open',
      payload: { path: 'content/real-file.md' },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ status: string; path: string }>();
    expect(body.status).toBe('launched');
    expect(body.path).toBe('content/real-file.md');

    // Decision should be recorded as 'external'
    const session = sessionManager.getActive();
    expect(session?.decisions['content/real-file.md']).toBe('external');
  });

  it('returns 400 for missing body', async () => {
    sessionManager.create({
      repoRoot: remote.engineClone,
      branch: remote.branch,
      paths: ['content/a.md'],
      content: {},
    });

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/open',
      payload: {},
    });
    expect(resp.statusCode).toBe(400);
  });
});
