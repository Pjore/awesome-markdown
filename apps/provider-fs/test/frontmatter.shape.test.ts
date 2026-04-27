import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';

describe('frontmatter shape', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;
  let boardId: string;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const boardRes = await server.inject({
      method: 'POST',
      url: '/boards',
      headers: { 'content-type': 'application/json' },
      payload: { slug: 'fm-board', title: 'Frontmatter Board' },
    });
    boardId = boardRes.json<{ id: string }>().id;
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('writes a .md file with valid YAML frontmatter', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col-1',
        swimlaneId: 'lane-1',
        title: 'FM Test',
        body: '## Description\n\nThis is the body.',
        status: 'todo',
        priority: 'high',
        tags: ['alpha', 'beta'],
        customFields: { sprint: 3 },
      },
    });
    expect(res.statusCode).toBe(201);
    const { id } = res.json<{ id: string }>();

    // Read the actual file from disk
    const filePath = path.join(
      tmp.contentRoot,
      'boards',
      boardId,
      'items',
      `${id}.md`,
    );
    const raw = await readFile(filePath, 'utf-8');
    const parsed = matter(raw);

    // Frontmatter must contain all required scalar fields
    expect(parsed.data).toMatchObject({
      id,
      boardId,
      columnId: 'col-1',
      swimlaneId: 'lane-1',
      title: 'FM Test',
      status: 'todo',
      priority: 'high',
    });
    expect(Array.isArray(parsed.data.tags)).toBe(true);
    expect(parsed.data.tags).toEqual(['alpha', 'beta']);

    // Custom fields round-trip
    expect(parsed.data.customFields).toEqual({ sprint: 3 });

    // Body should contain the markdown content
    expect(parsed.content.trim()).toContain('Description');
    expect(parsed.content.trim()).toContain('This is the body.');
  });

  it('preserves unknown frontmatter fields on update', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col-1',
        swimlaneId: 'lane-1',
        title: 'Preserve Test',
        body: 'Original body',
        status: 'todo',
        priority: 'low',
        tags: [],
        customFields: {},
      },
    });
    const { id } = created.json<{ id: string }>();

    // Manually inject an unknown frontmatter field into the file
    const filePath = path.join(
      tmp.contentRoot,
      'boards',
      boardId,
      'items',
      `${id}.md`,
    );
    const rawBefore = await readFile(filePath, 'utf-8');
    const parsedBefore = matter(rawBefore);
    const withExtra = matter.stringify(parsedBefore.content, {
      ...parsedBefore.data,
      _unknownField: 'preserve-me',
    });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(filePath, withExtra, 'utf-8');

    // Update via route
    await server.inject({
      method: 'PUT',
      url: `/boards/${boardId}/items/${id}`,
      headers: { 'content-type': 'application/json' },
      payload: { title: 'Updated Title' },
    });

    // Re-read file and check unknown field is preserved
    const rawAfter = await readFile(filePath, 'utf-8');
    const parsedAfter = matter(rawAfter);
    expect(parsedAfter.data._unknownField).toBe('preserve-me');
    expect(parsedAfter.data.title).toBe('Updated Title');
  });

  it('tags and nested customFields round-trip correctly', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/boards/${boardId}/items`,
      headers: { 'content-type': 'application/json' },
      payload: {
        boardId,
        columnId: 'col-1',
        swimlaneId: 'lane-1',
        title: 'Nested Test',
        body: '',
        status: 'in-progress',
        priority: 'urgent',
        tags: ['x', 'y', 'z'],
        customFields: { nested: { a: 1, b: [2, 3] } },
      },
    });
    const { id } = res.json<{ id: string }>();

    const getRes = await server.inject({
      method: 'GET',
      url: `/boards/${boardId}/items/${id}`,
    });
    const item = getRes.json<{
      tags: string[];
      customFields: Record<string, unknown>;
    }>();
    expect(item.tags).toEqual(['x', 'y', 'z']);
    expect(item.customFields).toEqual({ nested: { a: 1, b: [2, 3] } });
  });
});
