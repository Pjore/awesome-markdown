import { readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { ItemSchema } from '@awesome-markdown/contracts';
import type { Item } from '@awesome-markdown/contracts';
import { RepoError, isENOENT } from '../errors.js';
import { itemFile, itemsDir, assertWithinRoot } from './paths.js';
import { writeFileAtomic } from './atomic-write.js';

export class ItemsRepo {
  constructor(private readonly contentRoot: string) {}

  /** Serialize an Item to a markdown file with YAML frontmatter. */
  private serializeItem(item: Item): string {
    const { body, ...frontmatter } = item;
    return matter.stringify(body ?? '', frontmatter);
  }

  /** Parse a markdown file with YAML frontmatter back into an Item. */
  private deserializeItem(content: string, filePath: string): Item {
    const parsed = matter(content);
    const data: unknown = {
      ...parsed.data,
      body: parsed.content.trim(),
    };
    const result = ItemSchema.safeParse(data);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid item file at ${filePath}: ${result.error.message}`,
      );
    }
    return result.data;
  }

  async list(boardId: string): Promise<Item[]> {
    const dir = itemsDir(this.contentRoot, boardId);
    try {
      const entries = await readdir(dir);
      const items: Item[] = [];
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          const filePath = path.join(dir, entry);
          try {
            const content = await readFile(filePath, 'utf-8');
            items.push(this.deserializeItem(content, filePath));
          } catch {
            // Skip invalid or unreadable files
          }
        }
      }
      return items;
    } catch (err: unknown) {
      if (isENOENT(err)) return [];
      throw new RepoError('io_error', `Failed to list items: ${String(err)}`, err);
    }
  }

  async get(boardId: string, itemId: string): Promise<Item> {
    const filePath = itemFile(this.contentRoot, boardId, itemId);
    assertWithinRoot(this.contentRoot, filePath);
    try {
      const content = await readFile(filePath, 'utf-8');
      return this.deserializeItem(content, filePath);
    } catch (err: unknown) {
      if (err instanceof RepoError) throw err;
      if (isENOENT(err)) throw new RepoError('not_found', `Item ${itemId} not found`);
      throw new RepoError(
        'io_error',
        `Failed to read item ${itemId}: ${String(err)}`,
        err,
      );
    }
  }

  async create(data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>): Promise<Item> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: Item = { ...data, id, createdAt: now, updatedAt: now };

    const result = ItemSchema.safeParse(item);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid item: ${result.error.message}`,
      );
    }

    const filePath = itemFile(this.contentRoot, data.boardId, id);
    assertWithinRoot(this.contentRoot, filePath);
    await writeFileAtomic(filePath, this.serializeItem(result.data));
    return result.data;
  }

  async update(
    boardId: string,
    itemId: string,
    data: Partial<Omit<Item, 'id' | 'createdAt'>>,
  ): Promise<Item> {
    const filePath = itemFile(this.contentRoot, boardId, itemId);
    assertWithinRoot(this.contentRoot, filePath);

    let rawContent: string;
    try {
      rawContent = await readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      if (isENOENT(err)) throw new RepoError('not_found', `Item ${itemId} not found`);
      throw new RepoError(
        'io_error',
        `Failed to read item ${itemId}: ${String(err)}`,
        err,
      );
    }

    const parsed = matter(rawContent);
    const existing = this.deserializeItem(rawContent, filePath);

    const updated: Item = {
      ...existing,
      ...data,
      id: itemId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const result = ItemSchema.safeParse(updated);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid item: ${result.error.message}`,
      );
    }

    // Preserve unknown frontmatter fields on read-modify-write
    const { body, ...knownFrontmatter } = result.data;
    const mergedFrontmatter = { ...parsed.data, ...knownFrontmatter };
    const newContent = matter.stringify(body ?? '', mergedFrontmatter);

    await writeFileAtomic(filePath, newContent);
    return result.data;
  }

  async delete(boardId: string, itemId: string): Promise<void> {
    const filePath = itemFile(this.contentRoot, boardId, itemId);
    assertWithinRoot(this.contentRoot, filePath);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      if (isENOENT(err)) throw new RepoError('not_found', `Item ${itemId} not found`);
      throw new RepoError(
        'io_error',
        `Failed to delete item ${itemId}: ${String(err)}`,
        err,
      );
    }
  }
}
