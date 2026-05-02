/**
 * GitHub webhook receiver — POST /webhooks/github
 *
 * Receives push deliveries from GitHub, verifies the HMAC-SHA256 signature,
 * filters by event type and target branch, then calls engine.triggerPullNow()
 * for accepted push events.
 *
 * The raw-body content-type parser registered here is **encapsulated** to this
 * plugin scope via fastify.register(), so other JSON routes are unaffected.
 */
import type { FastifyInstance } from 'fastify';
import { verifyGitHubSignature } from './webhook-signature.js';
import type { WebhookTriggerReason } from '../types.js';

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

export interface WebhookTriggerEngine {
  triggerPullNow(reason: WebhookTriggerReason): void;
}

export interface WebhookRouteContext {
  engine: WebhookTriggerEngine;
  webhookSecret: string;
  targetBranch: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Mount `POST /webhooks/github` on the given Fastify instance.
 *
 * Internally registers the route inside an encapsulated plugin scope so that
 * the raw-body `application/json` parser does not bleed into the root server.
 */
export function mountWebhookRoutes(
  fastify: FastifyInstance,
  ctx: WebhookRouteContext,
): void {
  fastify.register(async (scope) => {
    // -----------------------------------------------------------------------
    // Encapsulated raw-body content-type parser
    // Returning the raw Buffer as req.body lets the handler verify the HMAC
    // over exact byte sequence before any JSON parsing occurs.
    // -----------------------------------------------------------------------
    scope.addContentTypeParser<Buffer>(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body);
      },
    );

    // -----------------------------------------------------------------------
    // POST /webhooks/github
    // -----------------------------------------------------------------------
    scope.post('/webhooks/github', async (req, reply) => {
      try {
        // Step 1: Require a raw body buffer from our content-type parser
        const rawBody = req.body as Buffer | undefined;
        if (!rawBody || !Buffer.isBuffer(rawBody)) {
          return reply.code(400).send({ ok: false, reason: 'missing-body' });
        }

        // Step 2: Constant-time HMAC-SHA256 signature check
        const sigHeader = req.headers['x-hub-signature-256'] as string | undefined;
        if (!verifyGitHubSignature(rawBody, sigHeader, ctx.webhookSecret)) {
          req.log.info({ event: 'webhook-rejected', reason: 'signature' }, 'webhook delivery rejected: invalid signature');
          return reply.code(401).send({ ok: false, reason: 'signature' });
        }

        const event = req.headers['x-github-event'] as string | undefined;
        const deliveryId = (req.headers['x-github-delivery'] as string | undefined) ?? 'unknown';

        req.log.info({ deliveryId, event }, 'webhook delivery received');

        // Step 3: Event-type filter
        if (event === 'ping') {
          return reply.code(202).send({ ok: true, action: 'ping' });
        }

        if (event !== 'push') {
          return reply.code(202).send({ ok: true, action: 'ignored', reason: 'event-type' });
        }

        // Step 4: Parse JSON now that the signature is verified
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
        } catch {
          return reply.code(400).send({ ok: false, reason: 'invalid-json' });
        }

        // Step 5: Branch filter
        const ref = typeof payload['ref'] === 'string' ? payload['ref'] : '';
        const expectedRef = `refs/heads/${ctx.targetBranch}`;
        if (ref !== expectedRef) {
          req.log.info(
            { deliveryId, ref, targetBranch: ctx.targetBranch, action: 'ignored', reason: 'branch' },
            'webhook push ignored: branch mismatch',
          );
          return reply.code(202).send({ ok: true, action: 'ignored', reason: 'branch' });
        }

        // Step 6: Enqueue pull — fire-and-forget
        const commitSha =
          typeof payload['after'] === 'string' && payload['after']
            ? payload['after']
            : undefined;
        ctx.engine.triggerPullNow({ deliveryId, commitSha });

        req.log.info({ deliveryId, ref, action: 'queued' }, 'webhook push accepted, pull queued');

        // Step 7: Acknowledge immediately (before pull completes)
        return reply.code(202).send({ ok: true, action: 'queued' });
      } catch (err) {
        // Unexpected errors must not expose internal details
        req.log.error({ err: err instanceof Error ? err.message : String(err) }, 'webhook handler error');
        return reply.code(500).send({ ok: false, reason: 'internal-error' });
      }
    });
  });
}
