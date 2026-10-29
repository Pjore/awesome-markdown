import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseEntityResult } from '@awesome-markdown/core/markdown';
import type { ParsedEntity } from '@awesome-markdown/core/markdown';

// ---------------------------------------------------------------------------
// Typed entity union
// ---------------------------------------------------------------------------

export type ScannedEntity =
  | (ParsedEntity & { filePath: string })
  | { entityType: 'invalid'; filePath: string; message: string };

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
  } catch (error) {
    return {
      entityType: 'invalid',
      filePath,
      message: error instanceof Error ? error.message : 'Cannot read source',
    };
  }

  const result = parseEntityResult(raw);
  if (result.ok) return { ...result.entity, filePath };
  if (result.reason === 'no_entity_type' || result.reason === 'unknown_entity_type') return null;
  return { entityType: 'invalid', filePath, message: result.message };
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
