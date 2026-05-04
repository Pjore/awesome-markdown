import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { z } from 'zod';
import { openExternalFile } from '../conflict/open-external.js';
import { applyConflictDecisions } from '../conflict/resolver.js';
import { injectConflict } from '../conflict/inject.js';
import type { ConflictSessionManager } from '../conflict/session.js';
import type { SseHub } from '../sse-hub.js';
import type { RemoteConfig } from '../remote-config.js';

// ---------------------------------------------------------------------------
// Context passed to route mounter
// ---------------------------------------------------------------------------

export interface ConflictRouteContext {
  sessionManager: ConflictSessionManager;
  repoRoot: string;
  contentDir: string;
  hub: SseHub;
  getRemoteConfig: () => RemoteConfig | null;
  commitAuthorName: string;
  commitAuthorEmail: string;
  testHooks: boolean;
  /** Pause / resume the file watcher's auto-commit during conflict resolution. */
  setConflictPending: (pending: boolean) => void;
}

// ---------------------------------------------------------------------------
// Request / body schemas (Zod v4, imported from "zod" only)
// ---------------------------------------------------------------------------

const ResolveDecisionSchema = z.enum(['ours', 'theirs', 'external']);

const ResolveBodySchema = z.object({
  mergeId: z.string().min(1),
  decisions: z.record(z.string(), ResolveDecisionSchema),
});

const OpenBodySchema = z.object({
  path: z.string().min(1),
});

const InjectBodySchema = z.object({
  paths: z.array(z.string()).min(1),
  oursContent: z.record(z.string(), z.string()),
  theirsContent: z.record(z.string(), z.string()),
});

// ---------------------------------------------------------------------------
// Route mounting
// ---------------------------------------------------------------------------

/**
 * Mount conflict-resolution HTTP routes on the given Fastify instance.
 *
 * Routes:
 *   GET  /sync/conflict/state    — current session or null
 *   POST /sync/conflict/resolve  — apply per-path decisions
 *   POST /sync/conflict/open     — launch OS default editor
 *   POST /sync/conflict/inject   — test-only conflict injector
 */
export function mountConflictRoutes(
  fastify: FastifyInstance,
  ctx: ConflictRouteContext,
): void {
  const { sessionManager, repoRoot, contentDir, hub, getRemoteConfig,
          commitAuthorName, commitAuthorEmail, testHooks,
          setConflictPending } = ctx;

  // ---- GET /sync/conflict/state -------------------------------------------

  fastify.get('/sync/conflict/state', async (_req, reply) => {
    const state = sessionManager.toConflictState();
    return reply.code(200).send({ conflict: state });
  });

  // ---- POST /sync/conflict/resolve ----------------------------------------

  fastify.post('/sync/conflict/resolve', async (req, reply) => {
    const parsed = ResolveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_BODY',
        details: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const { mergeId, decisions } = parsed.data;

    // Idempotency: if this mergeId was already completed, return success
    if (sessionManager.wasCompleted(mergeId)) {
      return reply.code(200).send({ status: 'completed', remainingPaths: [] });
    }

    const session = sessionManager.getActive();
    if (!session || session.mergeId !== mergeId) {
      return reply.code(409).send({
        error: 'NO_ACTIVE_SESSION',
        message: 'No active conflict session matching the provided mergeId',
      });
    }

    // Validate that all submitted paths are part of the session
    const unknownPaths = Object.keys(decisions).filter(
      (p) => !session.paths.includes(p),
    );
    if (unknownPaths.length > 0) {
      return reply.code(400).send({
        error: 'UNKNOWN_PATHS',
        paths: unknownPaths,
      });
    }

    try {
      const result = await applyConflictDecisions({
        session,
        sessionManager,
        decisions,
        hub,
        remoteConfig: getRemoteConfig(),
        commitAuthorName,
        commitAuthorEmail,
      });
      return reply.code(200).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error: 'GIT_FAILURE', message });
    }
  });

  // ---- POST /sync/conflict/open -------------------------------------------

  fastify.post('/sync/conflict/open', async (req, reply) => {
    const parsed = OpenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_BODY',
        details: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const { path: filePath } = parsed.data;

    // Validate path before touching the session: reject traversal here so the
    // behaviour is predictable even when openExternalFile is mocked in tests.
    if (
      path.isAbsolute(filePath) ||
      filePath.includes('..') ||
      filePath.startsWith('/')
    ) {
      return reply.code(400).send({
        error: 'INVALID_PATH',
        message: `Path traversal rejected: "${filePath}"`,
      });
    }

    const session = sessionManager.getActive();
    if (!session) {
      return reply.code(409).send({
        error: 'NO_ACTIVE_SESSION',
        message: 'No active conflict session',
      });
    }

    if (!session.paths.includes(filePath)) {
      return reply.code(400).send({
        error: 'UNKNOWN_PATH',
        path: filePath,
      });
    }

    try {
      openExternalFile(repoRoot, filePath);
      sessionManager.recordDecision(filePath, 'external');
      return reply.code(200).send({ status: 'launched', path: filePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Path traversal') || message.includes('Absolute paths')) {
        return reply.code(400).send({ error: 'INVALID_PATH', message });
      }
      return reply.code(500).send({ error: 'OPEN_FAILED', message });
    }
  });

  // ---- POST /sync/conflict/inject (test-only) ------------------------------

  if (testHooks) {
    fastify.post('/sync/conflict/inject', async (req, reply) => {
      const parsed = InjectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_BODY',
          details: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      if (sessionManager.getActive()) {
        return reply.code(409).send({
          error: 'SESSION_EXISTS',
          message: 'An active conflict session already exists',
        });
      }

      try {
        const mergeId = await injectConflict({
          req: parsed.data,
          repoRoot,
          contentDir,
          commitAuthorName,
          commitAuthorEmail,
          sessionManager,
          hub,
        });
        // Pause the file watcher's auto-commit so it doesn't race with the
        // resolver's merge commit when the user applies a decision.
        setConflictPending(true);
        return reply.code(200).send({ mergeId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: 'INJECT_FAILED', message });
      }
    });
  }
}
