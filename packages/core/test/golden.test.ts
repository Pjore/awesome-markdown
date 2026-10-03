/**
 * Golden render snapshots over the repo's `content/` directory.
 *
 * The golden JSON files are the wire output of provider-fs
 * `GET /boards/:slug/render` and `/homeless` (they were first generated from
 * provider-fs before this logic moved into core; provider-fs asserts against
 * the same files in `apps/provider-fs/test/golden.routes.test.ts`). Other
 * backends (e.g. a Postgres-backed store) can reuse them as parity fixtures.
 *
 * When `content/` legitimately changes, regenerate with
 * `pnpm --filter @awesome-markdown/core test -u` and review the diff.
 */
import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoardRenderSchema, HomelessSchema } from '@awesome-markdown/contracts';
import type { Axis, Board, Item } from '@awesome-markdown/contracts';
import { computeHomeless, renderBoard } from '../src/index.js';
import { parseEntity } from '../src/markdown.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const contentRoot = path.resolve(here, '../../../content');

async function loadContent(): Promise<{ items: Item[]; boards: Board[]; axes: Map<string, Axis> }> {
  const items: Item[] = [];
  const boards: Board[] = [];
  const axes = new Map<string, Axis>();
  const names = (await readdir(contentRoot)).filter(n => n.endsWith('.md')).sort();
  for (const name of names) {
    const entity = parseEntity(await readFile(path.join(contentRoot, name), 'utf-8'), name);
    if (entity?.entityType === 'item') items.push(entity.data);
    else if (entity?.entityType === 'board') boards.push(entity.data);
    else if (entity?.entityType === 'axis') axes.set(entity.slug, entity.data);
  }
  return { items, boards, axes };
}

/** Same bytes provider-fs puts on the wire: schema-encoded, pretty-printed. */
function wire(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const { items, boards, axes } = await loadContent();

describe('golden render over repo content/', () => {
  it('finds boards in content/', () => {
    expect(boards.length).toBeGreaterThan(0);
  });

  for (const board of boards) {
    const input = { board, lookupAxis: (s: string) => axes.get(s), items };

    it(`renderBoard(${board.slug}) matches golden`, async () => {
      const render = renderBoard(input);
      const encoded = BoardRenderSchema.parse(render);
      expect(encoded).toEqual(render);
      await expect(wire(encoded)).toMatchFileSnapshot(`./golden/${board.slug}.render.json`);
    });

    it(`computeHomeless(${board.slug}) matches golden`, async () => {
      const homeless = computeHomeless(input);
      const encoded = HomelessSchema.parse(homeless);
      expect(encoded).toEqual(homeless);
      await expect(wire(encoded)).toMatchFileSnapshot(`./golden/${board.slug}.homeless.json`);
    });
  }
});
