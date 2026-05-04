import type { Item, Mutation } from '@awesome-markdown/contracts';
import { parsePath } from '@awesome-markdown/filter-engine';

type Rec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Path navigation helper
// ---------------------------------------------------------------------------

/**
 * Navigate to the parent container and final key for the given path segments.
 *
 * Array navigation uses board-entry lookup: when the current value is an
 * array, we find (or create, when upsert=true) the entry whose `board`
 * property matches the current segment. This mirrors how the filter engine
 * resolves `boards.<slug>.*` paths.
 *
 * Returns null when navigation is impossible and upsert is false.
 */
function navigateToParent(
  root: Rec,
  segments: string[],
  upsert: boolean,
): { parent: Rec; finalKey: string } | null {
  if (segments.length === 0) return null;

  let current: unknown = root;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;

    if (Array.isArray(current)) {
      let entry = (current as Rec[]).find(el => el['board'] === seg);
      if (!entry) {
        if (!upsert) return null;
        entry = { board: seg };
        (current as Rec[]).push(entry);
      }
      current = entry;
    } else if (typeof current === 'object' && current !== null) {
      const obj = current as Rec;
      if (obj[seg] === undefined || obj[seg] === null) {
        if (!upsert) return null;
        obj[seg] = {};
      }
      current = obj[seg];
    } else {
      return null;
    }
  }

  const finalKey = segments[segments.length - 1]!;
  if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
    return { parent: current as Rec, finalKey };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a list of mutations to an item, returning the updated item.
 * Sets `updatedAt` to `now` (defaults to current time).
 *
 * When a mutation targets a `boards.<slug>.*` path and no matching boards
 * entry exists, one is created (boards entry upsert).
 */
export function applyMutations(
  item: Item,
  mutations: Mutation[],
  now = new Date().toISOString(),
): Item {
  const clone = structuredClone(item) as Rec;

  for (const mut of mutations) {
    const segments = parsePath(mut.path);

    if (mut.op === 'set') {
      const nav = navigateToParent(clone, segments, true);
      if (nav) nav.parent[nav.finalKey] = mut.value;
    } else if (mut.op === 'delete') {
      const nav = navigateToParent(clone, segments, false);
      if (nav) delete nav.parent[nav.finalKey];
    } else if (mut.op === 'append') {
      const nav = navigateToParent(clone, segments, true);
      if (nav) {
        const arr = nav.parent[nav.finalKey];
        if (Array.isArray(arr)) {
          if (!(arr as unknown[]).includes(mut.value)) {
            (arr as unknown[]).push(mut.value);
          }
        } else {
          nav.parent[nav.finalKey] = [mut.value];
        }
      }
    } else if (mut.op === 'remove') {
      const nav = navigateToParent(clone, segments, false);
      if (nav) {
        const arr = nav.parent[nav.finalKey];
        if (Array.isArray(arr)) {
          nav.parent[nav.finalKey] = (arr as unknown[]).filter(v => v !== mut.value);
        }
      }
    }
  }

  clone['updatedAt'] = now;
  return clone as unknown as Item;
}
