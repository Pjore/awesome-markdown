import path from 'node:path';
import { RepoError } from '../errors.js';
import type { Item, Board, Axis } from '@awesome-markdown/contracts';
import type { ScannedEntity } from './scanner.js';

// ---------------------------------------------------------------------------
// Internal storage shape
// ---------------------------------------------------------------------------

interface Stored<T> {
  data: T;
  filePath: string;
}

type EntityRef = { entityType: 'item' | 'board' | 'axis'; slug: string };

// ---------------------------------------------------------------------------
// In-memory typed index
// ---------------------------------------------------------------------------

/**
 * Holds all parsed entities indexed by (entityType, slug).
 * Also maintains a reverse filePath → entity mapping to support
 * removeByFilePath (watcher unlink events).
 */
export class IndexStore {
  private readonly _items = new Map<string, Stored<Item>>();
  private readonly _boards = new Map<string, Stored<Board>>();
  private readonly _axes = new Map<string, Stored<Axis>>();
  private readonly _byFilePath = new Map<string, EntityRef>();
  private readonly _sourceErrors = new Map<string, string>();

  markSourceError(filePath: string, message: string): void {
    this._sourceErrors.set(filePath, message);
  }

  // ---------------------------------------------------------------------------
  // Typed getters
  // ---------------------------------------------------------------------------

  getItem(slug: string): Item | undefined {
    return this._items.get(slug)?.data;
  }

  getBoard(slug: string): Board | undefined {
    return this._boards.get(slug)?.data;
  }

  getAxis(slug: string): Axis | undefined {
    return this._axes.get(slug)?.data;
  }

  getItemFilePath(slug: string): string | undefined {
    return (
      this._items.get(slug)?.filePath ??
      [...this._sourceErrors.keys()].find((file) => path.basename(file) === `${slug}.md`)
    );
  }

  getBoardFilePath(slug: string): string | undefined {
    return this._boards.get(slug)?.filePath;
  }

  getAxisFilePath(slug: string): string | undefined {
    return this._axes.get(slug)?.filePath;
  }

  listItems(): Item[] {
    const failure = this._sourceErrors.entries().next().value;
    if (failure)
      throw new RepoError(
        'validation_failed',
        `Cannot render items: ${path.basename(failure[0])}: ${failure[1]}. Repair the source; no data was overwritten.`
      );
    return Array.from(this._items.values()).map((e) => e.data);
  }

  listBoards(): Board[] {
    return Array.from(this._boards.values()).map((e) => e.data);
  }

  listAxes(): Axis[] {
    return Array.from(this._axes.values()).map((e) => e.data);
  }

  // ---------------------------------------------------------------------------
  // Upsert methods
  // ---------------------------------------------------------------------------

  upsertItem(slug: string, data: Item, filePath: string): void {
    this._sourceErrors.delete(filePath);
    const prev = this._byFilePath.get(filePath);
    if (prev?.entityType === 'item' && prev.slug !== slug) {
      this._items.delete(prev.slug);
    }
    this._items.set(slug, { data, filePath });
    this._byFilePath.set(filePath, { entityType: 'item', slug });
  }

  upsertBoard(slug: string, data: Board, filePath: string): void {
    this._sourceErrors.delete(filePath);
    const prev = this._byFilePath.get(filePath);
    if (prev?.entityType === 'board' && prev.slug !== slug) {
      this._boards.delete(prev.slug);
    }
    this._boards.set(slug, { data, filePath });
    this._byFilePath.set(filePath, { entityType: 'board', slug });
  }

  upsertAxis(slug: string, data: Axis, filePath: string): void {
    this._sourceErrors.delete(filePath);
    const prev = this._byFilePath.get(filePath);
    if (prev?.entityType === 'axis' && prev.slug !== slug) {
      this._axes.delete(prev.slug);
    }
    this._axes.set(slug, { data, filePath });
    this._byFilePath.set(filePath, { entityType: 'axis', slug });
  }

  // ---------------------------------------------------------------------------
  // Removal by file path (for watcher unlink events)
  // ---------------------------------------------------------------------------

  removeByFilePath(filePath: string): void {
    this._sourceErrors.delete(filePath);
    const entry = this._byFilePath.get(filePath);
    if (!entry) return;
    this._byFilePath.delete(filePath);
    if (entry.entityType === 'item') this._items.delete(entry.slug);
    else if (entry.entityType === 'board') this._boards.delete(entry.slug);
    else this._axes.delete(entry.slug);
  }

  // ---------------------------------------------------------------------------
  // Bulk load from initial scan
  // ---------------------------------------------------------------------------

  loadFrom(entities: ScannedEntity[]): void {
    for (const entity of entities) {
      if (entity.entityType === 'invalid') {
        this.markSourceError(entity.filePath, entity.message);
      } else if (entity.entityType === 'item') {
        this.upsertItem(entity.slug, entity.data, entity.filePath);
      } else if (entity.entityType === 'board') {
        this.upsertBoard(entity.slug, entity.data, entity.filePath);
      } else {
        this.upsertAxis(entity.slug, entity.data, entity.filePath);
      }
    }
  }
}
