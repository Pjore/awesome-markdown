import { z } from 'zod';
import {
  ItemSchema,
  BoardSchema,
  AxisSchema,
  mergePatch,
  CreateItemRequestSchema,
  PatchItemRequestSchema,
  parseSafeYaml,
} from '@awesome-markdown/contracts';
import type {
  Item,
  Board,
  Axis,
  BoardRender,
  Homeless,
  CreateItemRequest,
  PatchItemRequest,
  CreateAxisRequest,
  CreateBoardRequest,
  PatchAxisRequest,
  PatchBoardRequest,
  PersistenceProvider,
  ProviderCapabilities,
  ProviderEventHandler,
  Unsubscribe,
  ItemRecord,
} from '@awesome-markdown/contracts';
import { applyMutations, renderBoard, computeHomeless } from '@awesome-markdown/core';
import { revisionOf, storageLock } from './item-storage.js';

// ---------------------------------------------------------------------------
// Storage — flat keyed by "entityType:slug"
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'awesome-markdown:v2';

const EntitySchema = z.union([ItemSchema, BoardSchema, AxisSchema]);
type Entity = z.infer<typeof EntitySchema>;

function storeKey(type: string, slug: string): string {
  return `${type}:${slug}`;
}

function readStore(): Map<string, Entity> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return new Map();
  try {
    JSON.parse(raw); // Require JSON syntax, then validate numeric source tokens before conversion.
    const parsed = parseSafeYaml(raw, true);
    const map = new Map<string, Entity>();
    for (const [k, v] of Object.entries(parsed)) {
      const r = EntitySchema.safeParse(v);
      if (!r.success)
        throw new Error(
          `Invalid stored entity ${k}: ${r.error.message}. Repair or export the source before continuing.`
        );
      map.set(k, r.data);
    }
    return map;
  } catch (error) {
    throw new Error(
      `Unable to load localStorage: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function writeStore(store: Map<string, Entity>): void {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of store) obj[k] = v;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Render helpers — mirror provider-fs/src/routes/boards.ts
// ---------------------------------------------------------------------------

function syntheticAxis(slug: string): Axis {
  return { entityType: 'axis', slug, title: slug, synthetic: true };
}

function resolveAxis(store: Map<string, Entity>, slug: string): Axis {
  const e = store.get(storeKey('axis', slug));
  return e?.entityType === 'axis' ? e : syntheticAxis(slug);
}

function firstDuplicate(arr: string[] | undefined): string | undefined {
  const seen = new Set<string>();
  for (const s of arr ?? []) {
    if (seen.has(s)) return s;
    seen.add(s);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// LocalStorageProvider
// ---------------------------------------------------------------------------

export class LocalStorageProvider implements PersistenceProvider {
  readonly capabilities: ProviderCapabilities = { type: 'local' };
  private readonly subs = new Set<ProviderEventHandler>();

  private emit(entitySlug: string, entityType: 'item' | 'board' | 'axis'): void {
    const ev = { type: 'change' as const, entitySlug, entityType };
    for (const h of this.subs) {
      try {
        h(ev);
      } catch {
        console.warn('Provider subscriber failed after a committed write');
      }
    }
  }

  subscribe(handler: ProviderEventHandler): Unsubscribe {
    this.subs.add(handler);
    const storage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === null) handler({ type: 'synced' });
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', storage);
    return () => {
      this.subs.delete(handler);
      if (typeof window !== 'undefined') window.removeEventListener('storage', storage);
    };
  }

  // -- Boards ----------------------------------------------------------------

  async listBoards(): Promise<Board[]> {
    return [...readStore().values()].filter((e): e is Board => e.entityType === 'board');
  }

  async getBoard(slug: string): Promise<Board | null> {
    const e = readStore().get(storeKey('board', slug));
    return e?.entityType === 'board' ? e : null;
  }

  async createBoard(req: CreateBoardRequest): Promise<Board> {
    const store = readStore();
    if (store.has(storeKey('board', req.slug))) {
      throw new Error(`Board already exists: ${req.slug}`);
    }
    const dupCol = firstDuplicate(req.columns);
    if (dupCol) throw new Error(`Duplicate column axis slug: ${dupCol}`);
    const dupLane = firstDuplicate(req.swimlanes);
    if (dupLane) throw new Error(`Duplicate swimlane axis slug: ${dupLane}`);

    const now = new Date().toISOString();
    const board: Board = {
      entityType: 'board',
      slug: req.slug,
      title: req.title,
      description: req.description,
      filter: req.filter,
      columns: req.columns,
      swimlanes: req.swimlanes,
      createdAt: now,
      updatedAt: now,
    };
    store.set(storeKey('board', req.slug), board);
    writeStore(store);
    this.emit(req.slug, 'board');
    return board;
  }

  async patchBoard(slug: string, req: PatchBoardRequest): Promise<Board> {
    const store = readStore();
    const e = store.get(storeKey('board', slug));
    if (!e || e.entityType !== 'board') throw new Error(`Board not found: ${slug}`);
    const dupCol = firstDuplicate(req.columns);
    if (dupCol) throw new Error(`Duplicate column axis slug: ${dupCol}`);
    const dupLane = firstDuplicate(req.swimlanes);
    if (dupLane) throw new Error(`Duplicate swimlane axis slug: ${dupLane}`);
    const updated: Board = { ...mergePatch(e, req), updatedAt: new Date().toISOString() };
    store.set(storeKey('board', slug), updated);
    writeStore(store);
    this.emit(slug, 'board');
    return updated;
  }

  // -- Axes ------------------------------------------------------------------

  async listAxes(): Promise<Axis[]> {
    return [...readStore().values()].filter((e): e is Axis => e.entityType === 'axis');
  }

  async getAxis(slug: string): Promise<Axis | null> {
    const e = readStore().get(storeKey('axis', slug));
    return e?.entityType === 'axis' ? e : null;
  }

  async createAxis(req: CreateAxisRequest): Promise<Axis> {
    const store = readStore();
    if (store.has(storeKey('axis', req.slug))) {
      throw new Error(`Axis already exists: ${req.slug}`);
    }
    const now = new Date().toISOString();
    const axis: Axis = {
      entityType: 'axis',
      slug: req.slug,
      title: req.title,
      description: req.description,
      filter: req.filter,
      order: req.order,
      writeOnDrop: req.writeOnDrop,
      createdAt: now,
      updatedAt: now,
    };
    store.set(storeKey('axis', req.slug), axis);
    writeStore(store);
    this.emit(req.slug, 'axis');
    return axis;
  }

  async patchAxis(slug: string, req: PatchAxisRequest): Promise<Axis> {
    const store = readStore();
    const e = store.get(storeKey('axis', slug));
    if (!e || e.entityType !== 'axis') throw new Error(`Axis not found: ${slug}`);
    const updated: Axis = { ...mergePatch(e, req), updatedAt: new Date().toISOString() };
    store.set(storeKey('axis', slug), updated);
    writeStore(store);
    this.emit(slug, 'axis');
    return updated;
  }

  // -- Render ----------------------------------------------------------------

  async getBoardRender(slug: string): Promise<BoardRender> {
    const store = readStore();
    const be = store.get(storeKey('board', slug));
    if (!be || be.entityType !== 'board') throw new Error(`Board not found: ${slug}`);
    return renderBoard({
      board: be,
      lookupAxis: (s) => resolveAxis(store, s),
      items: [...store.values()].filter((e): e is Item => e.entityType === 'item'),
    });
  }

  async getHomeless(boardSlug: string): Promise<Homeless> {
    const store = readStore();
    const be = store.get(storeKey('board', boardSlug));
    if (!be || be.entityType !== 'board') throw new Error(`Board not found: ${boardSlug}`);
    return computeHomeless({
      board: be,
      lookupAxis: (s) => resolveAxis(store, s),
      items: [...store.values()].filter((e): e is Item => e.entityType === 'item'),
    });
  }

  // -- Items -----------------------------------------------------------------

  async getItem(slug: string): Promise<ItemRecord | null> {
    const e = readStore().get(storeKey('item', slug));
    return e?.entityType === 'item' ? { item: e, revision: await revisionOf(e) } : null;
  }

  async createItem(req: CreateItemRequest): Promise<ItemRecord> {
    req = CreateItemRequestSchema.parse(req);
    return storageLock(async () => {
      const store = readStore();
      const now = new Date().toISOString();
      let finalSlug = req.slug;
      let suffix = 2;
      while (store.has(storeKey('item', finalSlug))) {
        finalSlug = `${req.slug}-${suffix++}`;
      }
      const base: Item = {
        entityType: 'item',
        slug: finalSlug,
        title: req.title,
        body: req.body ?? '',
        createdAt: now,
        updatedAt: now,
      };
      const item = req.mutations.length > 0 ? applyMutations(base, req.mutations, now) : base;
      const final = ItemSchema.parse({ ...item, createdAt: now, updatedAt: now });
      const revision = await revisionOf(final);
      const latest = readStore();
      if (latest.has(storeKey('item', finalSlug)))
        throw new Error('Item was created concurrently; retry creation.');
      latest.set(storeKey('item', finalSlug), final);
      writeStore(latest);
      this.emit(finalSlug, 'item');
      return { item: final, revision };
    });
  }

  async patchItem(slug: string, req: PatchItemRequest): Promise<ItemRecord> {
    req = PatchItemRequestSchema.parse(req);
    return storageLock(async () => {
      const store = readStore();
      const e = store.get(storeKey('item', slug));
      if (!e || e.entityType !== 'item') throw new Error(`Item not found: ${slug}`);
      if ((await revisionOf(e)) !== req.revision)
        throw new Error(
          'Conflict: this item changed. Export your draft or reload after discarding changes.'
        );
      const now = new Date().toISOString();
      const updated = applyMutations(e, req.mutations, now);
      const revision = await revisionOf(updated);
      const latest = readStore();
      if (JSON.stringify(latest.get(storeKey('item', slug))) !== JSON.stringify(e))
        throw new Error('Conflict: stored item changed during save.');
      latest.set(storeKey('item', slug), updated);
      writeStore(latest);
      this.emit(slug, 'item');
      return { item: updated, revision };
    });
  }

  async deleteItem(slug: string): Promise<void> {
    return storageLock(async () => {
      const store = readStore();
      store.delete(storeKey('item', slug));
      writeStore(store);
      this.emit(slug, 'item');
    });
  }
}
