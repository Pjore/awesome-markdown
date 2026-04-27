import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { ColumnSchema } from '@awesome-markdown/contracts';
import type { Column } from '@awesome-markdown/contracts';
import { RepoError, isENOENT } from '../errors.js';
import { columnsFile, assertWithinRoot } from './paths.js';
import { writeFileAtomic } from './atomic-write.js';

export class ColumnsRepo {
  constructor(private readonly contentRoot: string) {}

  private async readAll(boardId: string): Promise<Column[]> {
    const filePath = columnsFile(this.contentRoot, boardId);
    try {
      const content = await readFile(filePath, 'utf-8');
      const data = yaml.load(content);
      if (!Array.isArray(data)) return [];
      return data.map((item: unknown) => {
        const result = ColumnSchema.safeParse(item);
        if (!result.success) {
          throw new RepoError(
            'validation_failed',
            `Invalid column data: ${result.error.message}`,
          );
        }
        return result.data;
      });
    } catch (err: unknown) {
      if (err instanceof RepoError) throw err;
      if (isENOENT(err)) return [];
      throw new RepoError('io_error', `Failed to read columns: ${String(err)}`, err);
    }
  }

  private async writeAll(boardId: string, columns: Column[]): Promise<void> {
    const filePath = columnsFile(this.contentRoot, boardId);
    assertWithinRoot(this.contentRoot, filePath);
    await writeFileAtomic(filePath, yaml.dump(columns));
  }

  async list(boardId: string): Promise<Column[]> {
    return this.readAll(boardId);
  }

  async get(boardId: string, columnId: string): Promise<Column> {
    const columns = await this.readAll(boardId);
    const column = columns.find((c) => c.id === columnId);
    if (!column) {
      throw new RepoError(
        'not_found',
        `Column ${columnId} not found in board ${boardId}`,
      );
    }
    return column;
  }

  async create(data: Omit<Column, 'id'>): Promise<Column> {
    const { boardId } = data;
    const columns = await this.readAll(boardId);
    const id = crypto.randomUUID();
    const column: Column = { ...data, id };

    const result = ColumnSchema.safeParse(column);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid column: ${result.error.message}`,
      );
    }

    columns.push(result.data);
    await this.writeAll(boardId, columns);
    return result.data;
  }

  async update(
    boardId: string,
    columnId: string,
    data: Partial<Omit<Column, 'id'>>,
  ): Promise<Column> {
    const columns = await this.readAll(boardId);
    const idx = columns.findIndex((c) => c.id === columnId);
    if (idx === -1) {
      throw new RepoError('not_found', `Column ${columnId} not found in board ${boardId}`);
    }

    const existing = columns[idx]!;
    const updated: Column = { ...existing, ...data, id: columnId };

    const result = ColumnSchema.safeParse(updated);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid column: ${result.error.message}`,
      );
    }

    columns[idx] = result.data;
    await this.writeAll(boardId, columns);
    return result.data;
  }

  async delete(boardId: string, columnId: string): Promise<void> {
    const columns = await this.readAll(boardId);
    const filtered = columns.filter((c) => c.id !== columnId);
    if (filtered.length === columns.length) {
      throw new RepoError(
        'not_found',
        `Column ${columnId} not found in board ${boardId}`,
      );
    }
    await this.writeAll(boardId, filtered);
  }
}
