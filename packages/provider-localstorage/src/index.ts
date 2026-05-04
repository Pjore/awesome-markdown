import { z } from 'zod';
import { ItemSchema, BoardSchema, AxisSchema } from '@awesome-markdown/contracts';
import type {
  Item,
  Board,
  Axis,
  BoardRender,
  Homeless,
  CreateItemRequest,
  PatchItemRequest,
  PersistenceProvider,
  ProviderCapabilities,
  ProviderEventHandler,
  Unsubscribe,
  FilterRule,
  AxisOrder,
  Mutation,
} from '@awesome-markdown/contracts';
import { evaluate, analyzeInvertibility, resolvePath, parsePath } from '@awesome-markdown/filter-engine';
import type { Ctx } from '@awesome-markdown/filter-engine';

// ---------------------------------------------------------------------------
// Storage — flat keyed by "entityType:slug"
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'awesome-markdown:v2';

const EntitySchema = z.discriminatedUnion('entityType', [ItemSchema, BoardSchema, AxisSchema]);
type Entity = z.infer<typeof EntitySchema>;

function storeKey(type: string, slug: string): string {
  return `${type}:${slug}`;
}

function readStore(): Map<string, Entity> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map = new Map<string, Entity>();
    for (const [k, v] of Object.entries(parsed)) {
      const r = EntitySchema.safeParse(v);
      if (r.success) map.set(k, r.data);
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeStore(store: Map<string, Entity>): void {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of store) obj[k] = v;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Mutation application (path-based atomic write)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function navigateToParent(
  root: Rec,
  segments: string[],
  upsert: boolean,
): { parent: Rec; finalKey: string } | null {
  if (segments.length === 0) return null;
  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (Array.isArray(cur)) {
      let entry = (cur as Rec[]).find((el) => el['board'] === seg);
      if (!entry) {
        if (!upsert) return null;
        entry = { board: seg };
        (cur as Rec[]).push(entry);
      }
      cur = entry;
    } else if (typeof cur === 'object' && cur !== null) {
      const obj = cur as Rec;
      if (obj[seg] === undefined || obj[seg] === null) {
        if (!upsert) return null;
        obj[seg] = {};
      }
      cur = obj[seg];
    } else {
      return null;
    }
  }
  const finalKey = segments[segments.length - 1]!;
  return typeof cur === 'object' && cur !== null && !Array.isArray(cur)
    ? { parent: cur as Rec, finalKey }
    : null;
}

function applyMutations(item: Item, mutations: Mutation[], now: string): Item {
  const clone = structuredClone(item) as Rec;
  for (const mut of mutations) {
    const segs = parsePath(mut.path);
    if (mut.op === 'set') {
      const nav = navigateToParent(clone, segs, true);
      if (nav) nav.parent[nav.finalKey] = mut.value;
    } else if (mut.op === 'append') {
      const nav = navigateToParent(clone, segs, true);
      if (nav) {
        const cur = nav.parent[nav.finalKey];
        if (Array.isArray(cur)) cur.push(mut.value);
        else nav.parent[nav.finalKey] = [mut.value];
      }
    } else if (mut.op === 'remove') {
      const nav = navigateToParent(clone, segs, false);
      if (nav) {
        const cur = nav.parent[nav.finalKey];
        if (Array.isArray(cur))
          nav.parent[nav.finalKey] = cur.filter((el) => el !== mut.value);
      }
    } else {
      // delete
      const nav = navigateToParent(clone, segs, false);
      if (nav) delete nav.parent[nav.finalKey];
    }
  }
  clone['updatedAt'] = now;
  return clone as unknown as Item;
}

// ---------------------------------------------------------------------------
// Render helpers — mirror provider-fs/src/routes/boards.ts
// ---------------------------------------------------------------------------

function syntheticAxis(slug: string): Axis {
  return { entityType: 'axis', slug, title: slug, synthetic: true };
}

function compareScalars(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return 0;
}

function sortItems(items: Item[], order: AxisOrder | undefined, ctx: Ctx): Item[] {
  return [...items].sort((a, b) => {
    if (order) {
      const va = resolvePath(order.by, a, ctx);
      const vb = resolvePath(order.by, b, ctx);
      if (va !== undefined && vb !== undefined) {
        const cmp = compareScalars(va, vb);
        if (cmp !== 0) return order.direction === 'asc' ? cmp : -cmp;
      }
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function isCellReadOnly(boardFilter: FilterRule | undefined, col: Axis, lane: Axis): boolean {
  if (!Array.isArray(col.writeOnDrop) && col.writeOnDrop?.readonly) return true;
  if (!Array.isArray(lane.writeOnDrop) && lane.writeOnDrop?.readonly) return true;
  // Dimensions with explicit writeOnDrop arrays don't require filter invertibility.
  // Only include filters for dimensions that still rely on inversion.
  const filters: FilterRule[] = [];
  if (boardFilter) filters.push(boardFilter);
  if (!Array.isArray(col.writeOnDrop) && col.filter) filters.push(col.filter);
  if (!Array.isArray(lane.writeOnDrop) && lane.filter) filters.push(lane.filter);
  if (filters.length === 0) return false;
  const combined: FilterRule = filters.length === 1 ? filters[0]! : { all: filters };
  return !analyzeInvertibility(combined).invertible;
}

function resolveAxis(store: Map<string, Entity>, slug: string): Axis {
  const e = store.get(storeKey('axis', slug));
  return e?.entityType === 'axis' ? e : syntheticAxis(slug);
}

// ---------------------------------------------------------------------------
// LocalStorageProvider
// ---------------------------------------------------------------------------

export class LocalStorageProvider implements PersistenceProvider {
  readonly capabilities: ProviderCapabilities = { type: 'local' };
  private readonly subs = new Set<ProviderEventHandler>();

  private emit(entitySlug: string, entityType: 'item' | 'board' | 'axis'): void {
    const ev = { type: 'change' as const, entitySlug, entityType };
    for (const h of this.subs) h(ev);
  }

  subscribe(handler: ProviderEventHandler): Unsubscribe {
    this.subs.add(handler);
    return () => this.subs.delete(handler);
  }

  // -- Boards ----------------------------------------------------------------

  async listBoards(): Promise<Board[]> {
    return [...readStore().values()].filter((e): e is Board => e.entityType === 'board');
  }

  async getBoard(slug: string): Promise<Board | null> {
    const e = readStore().get(storeKey('board', slug));
    return e?.entityType === 'board' ? e : null;
  }

  // -- Axes ------------------------------------------------------------------

  async listAxes(): Promise<Axis[]> {
    return [...readStore().values()].filter((e): e is Axis => e.entityType === 'axis');
  }

  async getAxis(slug: string): Promise<Axis | null> {
    const e = readStore().get(storeKey('axis', slug));
    return e?.entityType === 'axis' ? e : null;
  }

  // -- Render ----------------------------------------------------------------

  async getBoardRender(slug: string): Promise<BoardRender> {
    const store = readStore();
    const be = store.get(storeKey('board', slug));
    if (!be || be.entityType !== 'board') throw new Error(`Board not found: ${slug}`);
    const board = be;
    const ctx: Ctx = { board: board.slug };
    const colAxes = (board.columns ?? []).map((s) => resolveAxis(store, s));
    const laneAxes = (board.swimlanes ?? []).map((s) => resolveAxis(store, s));
    const allItems = [...store.values()].filter((e): e is Item => e.entityType === 'item');
    const candidates = allItems.filter(
      (item) => !board.filter || evaluate(board.filter, item, ctx),
    );
    const cells = [];
    for (const col of colAxes) {
      for (const lane of laneAxes) {
        const cellItems = candidates.filter(
          (item) =>
            (!col.filter || evaluate(col.filter, item, ctx)) &&
            (!lane.filter || evaluate(lane.filter, item, ctx)),
        );
        cells.push({
          columnSlug: col.slug,
          swimlaneSlug: lane.slug,
          readOnly: isCellReadOnly(board.filter, col, lane),
          items: sortItems(cellItems, col.order, ctx),
        });
      }
    }
    return { board, axes: { columns: colAxes, swimlanes: laneAxes }, cells };
  }

  async getHomeless(boardSlug: string): Promise<Homeless> {
    const store = readStore();
    const be = store.get(storeKey('board', boardSlug));
    if (!be || be.entityType !== 'board') throw new Error(`Board not found: ${boardSlug}`);
    const board = be;
    const ctx: Ctx = { board: board.slug };
    const colAxes = (board.columns ?? []).map((s) => resolveAxis(store, s));
    const allItems = [...store.values()].filter((e): e is Item => e.entityType === 'item');
    const candidates = allItems.filter(
      (item) =>
        item.boards?.some((e) => e['board'] === board.slug) &&
        (!board.filter || evaluate(board.filter, item, ctx)),
    );
    const homeless = candidates.filter(
      (item) => !colAxes.some((col) => !col.filter || evaluate(col.filter, item, ctx)),
    );
    return { board, items: homeless };
  }

  // -- Items -----------------------------------------------------------------

  async getItem(slug: string): Promise<Item | null> {
    const e = readStore().get(storeKey('item', slug));
    return e?.entityType === 'item' ? e : null;
  }

  async createItem(req: CreateItemRequest): Promise<Item> {
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
      body: req.body,
      createdAt: now,
      updatedAt: now,
    };
    const item = req.mutations.length > 0 ? applyMutations(base, req.mutations, now) : base;
    const final = { ...item, createdAt: now, updatedAt: now } as Item;
    store.set(storeKey('item', finalSlug), final);
    writeStore(store);
    this.emit(finalSlug, 'item');
    return final;
  }

  async patchItem(slug: string, req: PatchItemRequest): Promise<Item> {
    const store = readStore();
    const e = store.get(storeKey('item', slug));
    if (!e || e.entityType !== 'item') throw new Error(`Item not found: ${slug}`);
    const now = new Date().toISOString();
    const updated = applyMutations(e, req.mutations, now);
    store.set(storeKey('item', slug), updated);
    writeStore(store);
    this.emit(slug, 'item');
    return updated;
  }

  async deleteItem(slug: string): Promise<void> {
    const store = readStore();
    store.delete(storeKey('item', slug));
    writeStore(store);
    this.emit(slug, 'item');
  }
}
