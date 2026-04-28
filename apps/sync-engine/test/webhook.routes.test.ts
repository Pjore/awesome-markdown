import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { mountWebhookRoutes } from '../src/http/webhook-routes.js';
import type { WebhookTriggerEngine, WebhookRouteContext } from '../src/http/webhook-routes.js';

// ---------------------------------------------------------------------------
// Constants used across tests
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'test-webhook-secret-xyz789';
const TARGET_BRANCH = 'main';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Build a minimal push-event payload. */
function pushPayload(
  ref = `refs/heads/${TARGET_BRANCH}`,
  after = 'abc123def456abc123def456abc123def456abc123',
): string {
  return JSON.stringify({ ref, after, commits: [] });
}

/** Create a spy engine and a mounted Fastify test server. */
async function buildServer(
  overrides: Partial<WebhookRouteContext> = {},
): Promise<{ fastify: FastifyInstance; triggerSpy: ReturnType<typeof vi.fn> }> {
  const triggerSpy = vi.fn<[{ deliveryId: string; commitSha?: string }], void>();
  const engine: WebhookTriggerEngine = { triggerPullNow: triggerSpy };

  const fastify = Fastify({ logger: false });
  mountWebhookRoutes(fastify, {
    engine,
    webhookSecret: WEBHOOK_SECRET,
    targetBranch: TARGET_BRANCH,
    ...overrides,
  });
  await fastify.ready();

  return { fastify, triggerSpy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /webhooks/github', () => {
  let fastify: FastifyInstance;
  let triggerSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ fastify, triggerSpy } = await buildServer());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fastify.close();
  });

  // -------------------------------------------------------------------------
  // Happy path — valid push on target branch
  // -------------------------------------------------------------------------

  it('valid signature + push on target branch → 202, spy called once with deliveryId and commitSha', async () => {
    const body = pushPayload();
    const deliveryId = randomUUID();

    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
        'x-github-event': 'push',
        'x-github-delivery': deliveryId,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(202);
    const json = response.json<{ ok: boolean; action: string }>();
    expect(json.ok).toBe(true);
    expect(json.action).toBe('queued');

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId,
        commitSha: 'abc123def456abc123def456abc123def456abc123',
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Branch filter
  // -------------------------------------------------------------------------

  it('valid signature + push on non-target branch → 202, spy not called, reason=branch', async () => {
    const body = pushPayload('refs/heads/feature/other-branch');
    const deliveryId = randomUUID();

    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
        'x-github-event': 'push',
        'x-github-delivery': deliveryId,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(202);
    const json = response.json<{ ok: boolean; action: string; reason: string }>();
    expect(json.action).toBe('ignored');
    expect(json.reason).toBe('branch');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Event-type filter
  // -------------------------------------------------------------------------

  it('valid signature + pull_request event → 202, spy not called, reason=event-type', async () => {
    const body = JSON.stringify({ action: 'opened', number: 1 });
    const deliveryId = randomUUID();

    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
        'x-github-event': 'pull_request',
        'x-github-delivery': deliveryId,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(202);
    const json = response.json<{ ok: boolean; action: string; reason: string }>();
    expect(json.action).toBe('ignored');
    expect(json.reason).toBe('event-type');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('valid signature + issues event → 202, spy not called, reason=event-type', async () => {
    const body = JSON.stringify({ action: 'opened' });
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
        'x-github-event': 'issues',
        'x-github-delivery': randomUUID(),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(202);
    expect(response.json<{ reason: string }>().reason).toBe('event-type');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Ping event
  // -------------------------------------------------------------------------

  it('valid signature + ping event → 202, spy not called, action=ping', async () => {
    const body = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 1 });
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
        'x-github-event': 'ping',
        'x-github-delivery': randomUUID(),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(202);
    expect(response.json<{ action: string }>().action).toBe('ping');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Signature failures → 401
  // -------------------------------------------------------------------------

  it('bad signature → 401, spy not called', async () => {
    const body = pushPayload();
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, 'wrong-secret'),
        'x-github-event': 'push',
        'x-github-delivery': randomUUID(),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(401);
    const json = response.json<{ ok: boolean; reason: string }>();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe('signature');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('missing x-hub-signature-256 header → 401, spy not called', async () => {
    const body = pushPayload();
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-github-delivery': randomUUID(),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(401);
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Coalescing: 5 sequential requests all return 202; spy called 5× from route
  // (coalescing happens inside triggerPullNow, not at the HTTP layer)
  // -------------------------------------------------------------------------

  it('burst of 5 sequential requests all return 202 and spy is called 5 times', async () => {
    const requests = Array.from({ length: 5 }, (_) => {
      const body = pushPayload();
      return fastify.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
          'x-github-event': 'push',
          'x-github-delivery': randomUUID(),
        },
        payload: body,
      });
    });

    const responses = await Promise.all(requests);
    for (const r of responses) {
      expect(r.statusCode).toBe(202);
    }
    expect(triggerSpy).toHaveBeenCalledTimes(5);
  });

  // -------------------------------------------------------------------------
  // Latency budget: success path responds within 250 ms
  // -------------------------------------------------------------------------

  it('success path responds within 250 ms (wall-clock budget)', async () => {
    const body = pushPayload();
    const deliveryId = randomUUID();

    const start = performance.now();
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': makeSignature(body, WEBHOOK_SECRET),
        'x-github-event': 'push',
        'x-github-delivery': deliveryId,
      },
      payload: body,
    });
    const elapsed = performance.now() - start;

    expect(response.statusCode).toBe(202);
    expect(elapsed).toBeLessThan(250);
  });
});

// ---------------------------------------------------------------------------
// No-mount: when webhook plugin is not registered, route returns 404
// ---------------------------------------------------------------------------

describe('webhook route not mounted', () => {
  it('POST /webhooks/github returns 404 when mountWebhookRoutes is not called', async () => {
    const fastify = Fastify({ logger: false });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(response.statusCode).toBe(404);
    await fastify.close();
  });
});

// ---------------------------------------------------------------------------
// Log redaction: route does not emit the secret or raw signature in log lines
// ---------------------------------------------------------------------------

describe('webhook log redaction', () => {
  it('captured log lines do not contain the webhook secret or raw signature header value', async () => {
    const capturedLines: string[] = [];

    // Build a minimal pino-compatible spy logger
    /* eslint-disable @typescript-eslint/no-explicit-any */
    function makeLogger(): any {
      const push = (obj: unknown, msg?: string) =>
        capturedLines.push(JSON.stringify({ obj, msg }));
      const log: any = {
        level: 'info',
        info: push,
        warn: push,
        error: push,
        debug: push,
        trace: push,
        fatal: push,
        silent: () => {},
        child: () => log,
      };
      return log;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const triggerSpy = vi.fn();
    const engine: WebhookTriggerEngine = { triggerPullNow: triggerSpy };

    // disableRequestLogging prevents Fastify from logging request headers
    // (which would otherwise include x-hub-signature-256).
    // Our route handler only logs deliveryId and event — never the secret or signature.
    const fastify = Fastify({
      loggerInstance: makeLogger(),
      disableRequestLogging: true,
    });
    mountWebhookRoutes(fastify, {
      engine,
      webhookSecret: WEBHOOK_SECRET,
      targetBranch: TARGET_BRANCH,
    });
    await fastify.ready();

    const body = pushPayload();
    const rawSignature = makeSignature(body, WEBHOOK_SECRET);

    await fastify.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': rawSignature,
        'x-github-event': 'push',
        'x-github-delivery': randomUUID(),
      },
      payload: body,
    });

    await fastify.close();

    const allLogs = capturedLines.join('\n');
    expect(allLogs).not.toContain(WEBHOOK_SECRET);
    expect(allLogs).not.toContain(rawSignature);
  });
});
