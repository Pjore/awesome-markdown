import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

type ErrorBody = { error: string; code?: string };

describe('validation error envelope', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('POST /items returns 400 for missing required fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('POST /items returns 400 for invalid slug', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: { slug: '..invalid..', title: 'Bad Slug', mutations: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
  });

  it('POST /items returns 400 for unknown extra fields (strict)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'x', title: 'X', mutations: [], unknownField: 'oops' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /items/:slug returns 400 for empty mutations array', async () => {
    // Create an item first
    await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'patch-val', title: 'Patch Val', mutations: [] },
    });

    const res = await server.inject({
      method: 'PATCH',
      url: '/items/patch-val',
      headers: { 'content-type': 'application/json' },
      payload: { mutations: [] }, // min(1) violation
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /items/:slug returns 404 with error envelope for missing item', async () => {
    const res = await server.inject({ method: 'GET', url: '/items/does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('not_found');
  });

  it('GET /boards/:slug/render returns 404 for missing board', async () => {
    const res = await server.inject({ method: 'GET', url: '/boards/does-not-exist/render' });
    expect(res.statusCode).toBe(404);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('not_found');
  });
});

