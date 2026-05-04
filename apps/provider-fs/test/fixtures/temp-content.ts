import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import type { Item, Board, Axis } from '@awesome-markdown/contracts';

export interface TempContentRoot {
  contentRoot: string;
  cleanup: () => Promise<void>;
}

/**
 * Allocate a per-test content root under the OS temp dir.
 * Returns the path and a cleanup function to delete it.
 */
export async function tmpContentRoot(): Promise<TempContentRoot> {
  const contentRoot = path.join(
    os.tmpdir(),
    `provider-fs-test-${crypto.randomUUID()}`,
  );
  await mkdir(contentRoot, { recursive: true });

  return {
    contentRoot,
    cleanup: async () => {
      await rm(contentRoot, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture file writers
// ---------------------------------------------------------------------------

/** Write an item .md file to the content root. */
export async function writeItemFixture(
  contentRoot: string,
  item: Item,
  subPath?: string,
): Promise<string> {
  const { body, ...frontmatter } = item;
  const content = matter.stringify(body ?? '', frontmatter);
  const filePath = subPath
    ? path.join(contentRoot, subPath)
    : path.join(contentRoot, `${item.slug}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** Write a board .md file to the content root. */
export async function writeBoardFixture(
  contentRoot: string,
  board: Board,
  subPath?: string,
): Promise<string> {
  const content = matter.stringify('', board);
  const filePath = subPath
    ? path.join(contentRoot, subPath)
    : path.join(contentRoot, `${board.slug}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** Write an axis .md file to the content root. */
export async function writeAxisFixture(
  contentRoot: string,
  axis: Axis,
  subPath?: string,
): Promise<string> {
  const content = matter.stringify('', axis);
  const filePath = subPath
    ? path.join(contentRoot, subPath)
    : path.join(contentRoot, `${axis.slug}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** Build a minimal valid Item fixture. */
export function makeItem(overrides: Partial<Item> & { slug: string; title: string }): Item {
  const now = '2024-01-01T00:00:00.000Z';
  return {
    entityType: 'item',
    slug: overrides.slug,
    title: overrides.title,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Build a minimal valid Board fixture. */
export function makeBoard(overrides: Partial<Board> & { slug: string; title: string }): Board {
  const now = '2024-01-01T00:00:00.000Z';
  return {
    entityType: 'board',
    slug: overrides.slug,
    title: overrides.title,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Build a minimal valid Axis fixture. */
export function makeAxis(overrides: Partial<Axis> & { slug: string; title: string }): Axis {
  const now = '2024-01-01T00:00:00.000Z';
  return {
    entityType: 'axis',
    slug: overrides.slug,
    title: overrides.title,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

