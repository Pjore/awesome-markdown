import { describe, it, expect } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from '../src/server.js';
import {
  tmpContentRoot,
  writeItemFixture,
  writeBoardFixture,
  writeAxisFixture,
  makeAxis,
  makeItem,
  makeBoard,
} from './fixtures/temp-content.js';

// Invalid sources must not become an empty/example item pool, including at startup.
describe('source integrity errors', () => {
  it('surfaces invalid source on load/render without blocking an unrelated valid item', async () => {
    const tmp = await tmpContentRoot();
    const file = path.join(tmp.contentRoot, 'invalid.md');
    const source =
      '---\nentityType: item\nslug: invalid\ncreatedAt: x\nupdatedAt: x\nvalue: 9007199254740993\n---\nOriginal document\n';
    await writeFile(file, source);
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: 'valid', title: 'Valid' }));
    await writeBoardFixture(tmp.contentRoot, makeBoard({ slug: 'board', title: 'Board' }));
    const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    try {
      const load = await server.inject({ method: 'GET', url: '/items/invalid' });
      expect(load.statusCode).toBe(422);
      expect(load.json().error).toMatch(/Repair|repair/);
      const render = await server.inject({ method: 'GET', url: '/boards/board/render' });
      expect(render.statusCode).toBe(422);
      expect(render.json().error).toContain('invalid.md');
      expect((await server.inject({ method: 'GET', url: '/items/valid' })).statusCode).toBe(200);
      expect(await readFile(file, 'utf8')).toBe(source);
    } finally {
      await server.close();
      await tmp.cleanup();
    }
  });
  it('identifies an incompatible item while leaving its data and unrelated item reads intact', async () => {
    const tmp = await tmpContentRoot();
    await writeBoardFixture(
      tmp.contentRoot,
      makeBoard({ slug: 'board', title: 'Board', columns: ['column'] })
    );
    await writeAxisFixture(
      tmp.contentRoot,
      makeAxis({
        slug: 'column',
        title: 'Column',
        order: { by: 'boards.$board.order', direction: 'asc' },
      })
    );
    await writeItemFixture(tmp.contentRoot, {
      ...makeItem({ slug: 'incompatible', title: 'Incompatible' }),
      boards: false,
    });
    await writeItemFixture(tmp.contentRoot, makeItem({ slug: 'valid', title: 'Valid' }));
    const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    try {
      const response = await server.inject({ method: 'GET', url: '/boards/board/render' });
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toContain('Item incompatible: Selector board requires a list');
      expect(
        (await server.inject({ method: 'GET', url: '/items/incompatible' })).json().item.boards
      ).toBe(false);
      expect((await server.inject({ method: 'GET', url: '/items/valid' })).statusCode).toBe(200);
    } finally {
      await server.close();
      await tmp.cleanup();
    }
  });
  it('checks unsafe numeric JSON tokens before parsing can round to a safe integer', async () => {
    const tmp = await tmpContentRoot();
    const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/items',
        headers: { 'content-type': 'application/json' },
        payload:
          '{"slug":"unsafe","title":"Unsafe","mutations":[{"op":"set","path":["value"],"value":9007199254740991.1}]}',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/numeric source/i);
      expect((await server.inject({ method: 'GET', url: '/items/unsafe' })).statusCode).toBe(404);
    } finally {
      await server.close();
      await tmp.cleanup();
    }
  });
});
