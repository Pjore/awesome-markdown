import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';
import type { Item } from '@awesome-markdown/contracts';

describe('frontmatter shape', () => {
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

  it('POST /items writes a .md file with valid YAML frontmatter', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: {
        slug: 'fm-item',
        title: 'FM Test',
        mutations: [],
        body: '## Description\n\nThis is the body.',
      },
    });
    expect(res.statusCode).toBe(201);
    const item = res.json<Item>();

    const filePath = path.join(tmp.contentRoot, 'fm-item.md');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = matter(raw);

    expect(parsed.data).toMatchObject({
      entityType: 'item',
      slug: 'fm-item',
      title: 'FM Test',
    });
    expect(parsed.content.trim()).toContain('Description');
    expect(parsed.content.trim()).toContain('This is the body.');
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });

  it('PATCH /items/:slug preserves passthrough fields', async () => {
    // Create item with extra fields via mutations
    await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: {
        slug: 'preserve-test',
        title: 'Preserve Test',
        mutations: [
          { op: 'set', path: 'status', value: 'todo' },
          { op: 'set', path: 'priority', value: 'low' },
        ],
      },
    });

    // Patch with a title change
    const patchRes = await server.inject({
      method: 'PATCH',
      url: '/items/preserve-test',
      headers: { 'content-type': 'application/json' },
      payload: {
        mutations: [{ op: 'set', path: 'title', value: 'Updated Title' }],
      },
    });
    expect(patchRes.statusCode).toBe(200);

    const filePath = path.join(tmp.contentRoot, 'preserve-test.md');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = matter(raw);

    // Status and priority were set via initial mutations and should still be there
    expect(parsed.data['status']).toBe('todo');
    expect(parsed.data['priority']).toBe('low');
    expect(parsed.data['title']).toBe('Updated Title');
  });

  it('POST /items with mutations sets extra fields in frontmatter', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload: {
        slug: 'tags-test',
        title: 'Tags Test',
        mutations: [
          { op: 'append', path: 'tags', value: 'x' },
          { op: 'append', path: 'tags', value: 'y' },
          { op: 'append', path: 'tags', value: 'z' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);

    const getRes = await server.inject({ method: 'GET', url: '/items/tags-test' });
    const item = getRes.json<Record<string, unknown>>();
    expect(item['tags']).toEqual(['x', 'y', 'z']);
  });
});


