import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createBareRemote } from './fixtures/bare-remote.js';
import { ConflictSessionManager } from '../src/conflict/session.js';
import { mountConflictRoutes } from '../src/http/conflict-routes.js';
import { SseHub } from '../src/sse-hub.js';
import type { BareRemote } from './fixtures/bare-remote.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    getRemoteConfig: () => null,
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

describe('conflict inject endpoint', () => {
  let remote: BareRemote;
  let sessionManager: ConflictSessionManager;
  let hub: SseHub;
  let server: FastifyInstance;

  beforeEach(async () => {
    remote = await createBareRemote();
    sessionManager = new ConflictSessionManager();
    hub = new SseHub();
    server = await buildTestServer(remote, sessionManager, hub, true);
  });

  afterEach(async () => {
    await server.close();
    await remote.cleanup();
  }, 30_000);

  it('inject creates a conflict session and emits conflict event', async () => {
    const events: unknown[] = [];
    const origBroadcast = hub.broadcast.bind(hub);
    hub.broadcast = (event) => { events.push(event); origBroadcast(event); };

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/inject',
      payload: {
        paths: ['content/inject-test.md'],
        oursContent: { 'content/inject-test.md': '# Ours\n' },
        theirsContent: { 'content/inject-test.md': '# Theirs\n' },
      },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ mergeId: string }>();
    expect(body.mergeId).toBeTruthy();

    const session = sessionManager.getActive();
    expect(session).not.toBeNull();
    expect(session?.mergeId).toBe(body.mergeId);

    const conflictEvents = events.filter((e) => (e as { type: string }).type === 'conflict');
    expect(conflictEvents.length).toBeGreaterThan(0);
  }, 30_000);

  it('inject returns 409 when session already active', async () => {
    // Create active session first
    await server.inject({
      method: 'POST',
      url: '/sync/conflict/inject',
      payload: {
        paths: ['content/first.md'],
        oursContent: { 'content/first.md': '# Ours\n' },
        theirsContent: { 'content/first.md': '# Theirs\n' },
      },
    });

    const resp = await server.inject({
      method: 'POST',
      url: '/sync/conflict/inject',
      payload: {
        paths: ['content/second.md'],
        oursContent: { 'content/second.md': '# Ours\n' },
        theirsContent: { 'content/second.md': '# Theirs\n' },
      },
    });

    expect(resp.statusCode).toBe(409);
  }, 30_000);
});
