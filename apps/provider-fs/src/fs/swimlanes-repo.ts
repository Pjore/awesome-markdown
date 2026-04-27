import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { SwimlaneSchema } from '@awesome-markdown/contracts';
import type { Swimlane } from '@awesome-markdown/contracts';
import { RepoError, isENOENT } from '../errors.js';
import { swimlanesFile, assertWithinRoot } from './paths.js';
import { writeFileAtomic } from './atomic-write.js';

export class SwimlanesRepo {
  constructor(private readonly contentRoot: string) {}

  private async readAll(boardId: string): Promise<Swimlane[]> {
    const filePath = swimlanesFile(this.contentRoot, boardId);
    try {
      const content = await readFile(filePath, 'utf-8');
      const data = yaml.load(content);
      if (!Array.isArray(data)) return [];
      return data.map((item: unknown) => {
        const result = SwimlaneSchema.safeParse(item);
        if (!result.success) {
          throw new RepoError(
            'validation_failed',
            `Invalid swimlane data: ${result.error.message}`,
          );
        }
        return result.data;
      });
    } catch (err: unknown) {
      if (err instanceof RepoError) throw err;
      if (isENOENT(err)) return [];
      throw new RepoError('io_error', `Failed to read swimlanes: ${String(err)}`, err);
    }
  }

  private async writeAll(boardId: string, swimlanes: Swimlane[]): Promise<void> {
    const filePath = swimlanesFile(this.contentRoot, boardId);
    assertWithinRoot(this.contentRoot, filePath);
    await writeFileAtomic(filePath, yaml.dump(swimlanes));
  }

  async list(boardId: string): Promise<Swimlane[]> {
    return this.readAll(boardId);
  }

  async get(boardId: string, swimlaneId: string): Promise<Swimlane> {
    const swimlanes = await this.readAll(boardId);
    const swimlane = swimlanes.find((s) => s.id === swimlaneId);
    if (!swimlane) {
      throw new RepoError(
        'not_found',
        `Swimlane ${swimlaneId} not found in board ${boardId}`,
      );
    }
    return swimlane;
  }

  async create(data: Omit<Swimlane, 'id'>): Promise<Swimlane> {
    const { boardId } = data;
    const swimlanes = await this.readAll(boardId);
    const id = crypto.randomUUID();
    const swimlane: Swimlane = { ...data, id };

    const result = SwimlaneSchema.safeParse(swimlane);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid swimlane: ${result.error.message}`,
      );
    }

    swimlanes.push(result.data);
    await this.writeAll(boardId, swimlanes);
    return result.data;
  }

  async update(
    boardId: string,
    swimlaneId: string,
    data: Partial<Omit<Swimlane, 'id'>>,
  ): Promise<Swimlane> {
    const swimlanes = await this.readAll(boardId);
    const idx = swimlanes.findIndex((s) => s.id === swimlaneId);
    if (idx === -1) {
      throw new RepoError(
        'not_found',
        `Swimlane ${swimlaneId} not found in board ${boardId}`,
      );
    }

    const existing = swimlanes[idx]!;
    const updated: Swimlane = { ...existing, ...data, id: swimlaneId };

    const result = SwimlaneSchema.safeParse(updated);
    if (!result.success) {
      throw new RepoError(
        'validation_failed',
        `Invalid swimlane: ${result.error.message}`,
      );
    }

    swimlanes[idx] = result.data;
    await this.writeAll(boardId, swimlanes);
    return result.data;
  }

  async delete(boardId: string, swimlaneId: string): Promise<void> {
    const swimlanes = await this.readAll(boardId);
    const filtered = swimlanes.filter((s) => s.id !== swimlaneId);
    if (filtered.length === swimlanes.length) {
      throw new RepoError(
        'not_found',
        `Swimlane ${swimlaneId} not found in board ${boardId}`,
      );
    }
    await this.writeAll(boardId, filtered);
  }
}
