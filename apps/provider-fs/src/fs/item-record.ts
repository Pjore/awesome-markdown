import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ItemRecord } from '@awesome-markdown/contracts';
import { parseEntityResult } from '@awesome-markdown/core/markdown';
import { RepoError, isENOENT } from '../errors.js';

export const revisionOf = (source: string): string =>
  createHash('sha256').update(source).digest('hex');

/** Read persisted bytes, not the potentially delayed watcher snapshot. */
export async function readItemRecord(filePath: string, slug: string): Promise<ItemRecord> {
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isENOENT(error)) throw new RepoError('not_found', `Item ${slug} was deleted`);
    throw error;
  }
  const parsed = parseEntityResult(source);
  if (!parsed.ok)
    throw new RepoError(
      'validation_failed',
      `Cannot load ${slug}: ${parsed.message}. Repair the source before saving.`
    );
  if (parsed.entity.entityType !== 'item' || parsed.entity.slug !== slug)
    throw new RepoError('validation_failed', 'Item identity changed on disk');
  return { item: parsed.entity.data, revision: revisionOf(source) };
}

const tails = new Map<string, Promise<unknown>>();
/** Coordinate all provider routes targeting the same item, including deletes. */
export async function itemLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  tails.set(key, next);
  try {
    return await next;
  } finally {
    if (tails.get(key) === next) tails.delete(key);
  }
}
