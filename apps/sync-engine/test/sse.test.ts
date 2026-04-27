import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEngineHarness } from './helpers/engineHarness.js';
import { SseClient } from './helpers/sseClient.js';
import { SyncEventSchema } from '@awesome-markdown/contracts';
import type { EngineHarness } from './helpers/engineHarness.js';

describe('SSE event emission', () => {
  let harness: EngineHarness;

  beforeEach(async () => {
    harness = await createEngineHarness(120);
    await new Promise((r) => setTimeout(r, 300));
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('emits a change event with commitSha and paths after a file write', async () => {
    const client = new SseClient(`${harness.baseUrl}/events`);
    await client.waitForConnection();

    await harness.writeFile('sse-test-1.md');

    const frame = await client.waitFor((f) => f.event === 'change');
    client.close();

    // Validate payload against the contract schema
    const parsed = SyncEventSchema.safeParse(frame.data);
    expect(parsed.success).toBe(true);

    if (parsed.success && parsed.data.type === 'change') {
      expect(parsed.data.type).toBe('change');
      expect(parsed.data.paths).toContain('content/sse-test-1.md');
      expect(typeof parsed.data.commitSha).toBe('string');
      expect(parsed.data.commitSha!.length).toBeGreaterThan(0);
    }
  });

  it('emits a synced event after a successful commit', async () => {
    const client = new SseClient(`${harness.baseUrl}/events`);
    await client.waitForConnection();

    await harness.writeFile('sse-synced.md');

    const frame = await client.waitFor((f) => f.event === 'synced');
    client.close();

    const parsed = SyncEventSchema.safeParse(frame.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('synced');
    }
  });

  it('two concurrent SSE clients both receive identical change events', async () => {
    const client1 = new SseClient(`${harness.baseUrl}/events`);
    const client2 = new SseClient(`${harness.baseUrl}/events`);
    await client1.waitForConnection();
    await client2.waitForConnection();

    await harness.writeFile('multi-client.md');

    const [frame1, frame2] = await Promise.all([
      client1.waitFor((f) => f.event === 'change'),
      client2.waitFor((f) => f.event === 'change'),
    ]);

    client1.close();
    client2.close();

    // Both frames should carry the same commitSha
    const d1 = frame1.data;
    const d2 = frame2.data;

    const p1 = SyncEventSchema.safeParse(d1);
    const p2 = SyncEventSchema.safeParse(d2);
    expect(p1.success).toBe(true);
    expect(p2.success).toBe(true);

    if (p1.success && p2.success && p1.data.type === 'change' && p2.data.type === 'change') {
      expect(p1.data.commitSha).toBe(p2.data.commitSha);
      expect(p1.data.paths).toEqual(p2.data.paths);
    }
  });

  it('GET /health returns 200', async () => {
    const res = await fetch(`${harness.baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('GET /status returns engine status', async () => {
    const res = await fetch(`${harness.baseUrl}/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as { running: boolean; watchedDir: string };
    expect(body.running).toBe(true);
    expect(typeof body.watchedDir).toBe('string');
  });
});
