import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import {
  tmpContentRoot,
  writeAxisFixture,
  makeAxis,
} from './fixtures/temp-content.js';
import type { TempContentRoot } from './fixtures/temp-content.js';
import type { Axis } from '@awesome-markdown/contracts';

describe('axes routes', () => {
  let tmp: TempContentRoot;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tmp = await tmpContentRoot();
  });

  afterEach(async () => {
    await server.close();
    await tmp.cleanup();
  });

  it('GET /axes returns all file-backed axes', async () => {
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'ax-1', title: 'Axis 1' }));
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'ax-2', title: 'Axis 2' }));
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/axes' });
    expect(res.statusCode).toBe(200);
    const axes = res.json<Axis[]>();
    expect(axes).toHaveLength(2);
    expect(axes.map(a => a.slug)).toContain('ax-1');
    expect(axes.map(a => a.slug)).toContain('ax-2');
  });

  it('GET /axes returns empty array when no axes exist', async () => {
    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/axes' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Axis[]>()).toHaveLength(0);
  });

  it('GET /axes ignores files without entityType', async () => {
    // Write a file without entityType — should be silently ignored
    const { writeFile } = await import('node:fs/promises');
    const path = await import('node:path');
    await writeFile(
      path.join(tmp.contentRoot, 'untagged.md'),
      '---\ntitle: No EntityType\n---\n',
      'utf-8',
    );
    await writeAxisFixture(tmp.contentRoot, makeAxis({ slug: 'real-ax', title: 'Real' }));

    server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/axes' });
    expect(res.statusCode).toBe(200);
    const axes = res.json<Axis[]>();
    // Only the real axis, not the untagged file
    expect(axes).toHaveLength(1);
    expect(axes[0]?.slug).toBe('real-ax');
  });
});
