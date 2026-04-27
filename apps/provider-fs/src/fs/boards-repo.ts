import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { BoardSchema } from '@awesome-markdown/contracts';
import type { Board } from '@awesome-markdown/contracts';
import { RepoError, isENOENT } from '../errors.js';
import { boardFile, boardDir, assertWithinRoot } from './paths.js';
import { writeFileAtomic } from './atomic-write.js';

export class BoardsRepo {
  constructor(private readonly contentRoot: string) {}

  async list(): Promise<Board[]> {
    const boardsDir = path.join(this.contentRoot, 'boards');
    try {
      const entries = await readdir(boardsDir, { withFileTypes: true });
      const boards: Board[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const board = await this.get(entry.name).catch(() => null);
          if (board !== null) boards.push(board);
        }
      }
      return boards;
    } catch (err: unknown) {
      if (isENOENT(err)) return [];
      throw new RepoError('io_error', `Failed to list boards: ${String(err)}`, err);
    }
  }

  async get(id: string): Promise<Board> {
    const filePath = boardFile(this.contentRoot, id);
    assertWithinRoot(this.contentRoot, filePath);
    try {
      const content = await readFile(filePath, 'utf-8');
      const data = yaml.load(content);
      const result = BoardSchema.safeParse(data);
      if (!result.success) {
        throw new RepoError(
          'validation_failed',
          `Invalid board data: ${result.error.message}`,
        );
      }
      return result.data;
    } catch (err: unknown) {
      if (err instanceof RepoError) throw err;
      if (isENOENT(err)) throw new RepoError('not_found', `Board ${id} not found`);
      throw new RepoError('io_error', `Failed to read board ${id}: ${String(err)}`, err);
    }
  }

  async create(data: Omit<Board, 'id' | 'createdAt' | 'updatedAt'>): Promise<Board> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const board: Board = { ...data, id, createdAt: now, updatedAt: now };

    const result = BoardSchema.safeParse(board);
    if (!result.success) {
      throw new RepoError('validation_failed', `Invalid board: ${result.error.message}`);
    }

    const filePath = boardFile(this.contentRoot, id);
    assertWithinRoot(this.contentRoot, filePath);

    await writeFileAtomic(filePath, yaml.dump(result.data));
    return result.data;
  }

  async update(
    id: string,
    data: Partial<Omit<Board, 'id' | 'createdAt'>>,
  ): Promise<Board> {
    const existing = await this.get(id);
    const updated: Board = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const result = BoardSchema.safeParse(updated);
    if (!result.success) {
      throw new RepoError('validation_failed', `Invalid board: ${result.error.message}`);
    }

    const filePath = boardFile(this.contentRoot, id);
    assertWithinRoot(this.contentRoot, filePath);
    await writeFileAtomic(filePath, yaml.dump(result.data));
    return result.data;
  }

  async delete(id: string): Promise<void> {
    const dir = boardDir(this.contentRoot, id);
    assertWithinRoot(this.contentRoot, dir);
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (err: unknown) {
      throw new RepoError(
        'io_error',
        `Failed to delete board ${id}: ${String(err)}`,
        err,
      );
    }
  }
}
