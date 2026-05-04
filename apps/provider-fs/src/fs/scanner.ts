import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { ItemSchema, BoardSchema, AxisSchema } from '@awesome-markdown/contracts';
import type { Item, Board, Axis } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Typed entity union
// ---------------------------------------------------------------------------

export type ScannedEntity =
  | { entityType: 'item'; slug: string; data: Item; filePath: string }
  | { entityType: 'board'; slug: string; data: Board; filePath: string }
  | { entityType: 'axis'; slug: string; data: Axis; filePath: string };

// ---------------------------------------------------------------------------
// Single-file parser
// ---------------------------------------------------------------------------

/**
 * Parse a single .md file. Returns null when:
 * - the file cannot be read (silently)
 * - frontmatter is missing or parse fails (logged)
 * - `entityType` is absent (silently ignored)
 * - Zod validation fails (logged, file skipped)
 */
export async function parseFile(filePath: string): Promise<ScannedEntity | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch (err) {
    console.warn(`[scanner] Failed to parse frontmatter in ${filePath}:`, err);
    return null;
  }

  const entityType = parsed.data['entityType'];
  if (entityType === undefined || entityType === null) return null;

  const body = (parsed.content ?? '').trim();

  if (entityType === 'item') {
    const result = ItemSchema.safeParse({ ...parsed.data, body });
    if (!result.success) {
      console.warn(`[scanner] Invalid item at ${filePath}:`, result.error.message);
      return null;
    }
    return { entityType: 'item', slug: result.data.slug, data: result.data, filePath };
  }

  if (entityType === 'board') {
    const result = BoardSchema.safeParse(parsed.data);
    if (!result.success) {
      console.warn(`[scanner] Invalid board at ${filePath}:`, result.error.message);
      return null;
    }
    return { entityType: 'board', slug: result.data.slug, data: result.data, filePath };
  }

  if (entityType === 'axis') {
    const result = AxisSchema.safeParse(parsed.data);
    if (!result.success) {
      console.warn(`[scanner] Invalid axis at ${filePath}:`, result.error.message);
      return null;
    }
    return { entityType: 'axis', slug: result.data.slug, data: result.data, filePath };
  }

  return null; // unknown entityType — silently ignored
}

// ---------------------------------------------------------------------------
// Directory scanner
// ---------------------------------------------------------------------------

async function collectMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return results;
  }
  for (const name of names) {
    const fullPath = path.join(dir, name);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(fullPath);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const sub = await collectMdFiles(fullPath);
      results.push(...sub);
    } else if (st.isFile() && name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Recursively scan contentRoot for .md files and return all valid entities. */
export async function scanDirectory(contentRoot: string): Promise<ScannedEntity[]> {
  const files = await collectMdFiles(contentRoot);
  const results: ScannedEntity[] = [];
  for (const filePath of files) {
    const entity = await parseFile(filePath);
    if (entity !== null) results.push(entity);
  }
  return results;
}
