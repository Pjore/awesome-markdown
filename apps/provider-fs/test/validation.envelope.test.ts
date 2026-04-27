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

  it('returns 400 for missing required board fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 for wrong type on board field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 123, title: 'Valid Title' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
  });

  it('returns 400 for unknown fields on board create (strict)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'test', title: 'Test', unknownField: 'oops' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid item priority', async () => {
    // Create a board first
    const boardRes = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'val-board', title: 'Val Board' },
    });
    const { id: boardId } = boardRes.json<{ id: string }>();

    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col',
        swimlaneId: 'lane',
        title: 'X',
        body: '',
        status: 'todo',
        priority: 'invalid-priority',
        tags: [],
        customFields: {},
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
  });

  it('returns 404 with error envelope for missing board', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/boards/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<ErrorBody>();
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('not_found');
  });

  it('returns 400 for unknown fields on item create (strict)', async () => {
    const boardRes = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'strict-board', title: 'Strict Board' },
    });
    const { id: boardId } = boardRes.json<{ id: string }>();

    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col',
        swimlaneId: 'lane',
        title: 'X',
        body: '',
        status: 'todo',
        priority: 'medium',
        tags: [],
        customFields: {},
        extraField: 'not-allowed',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
