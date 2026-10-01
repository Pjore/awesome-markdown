import type { Item, Mutation } from '@awesome-markdown/contracts';
import { parsePath } from '@awesome-markdown/filter-engine';

// ---------------------------------------------------------------------------
// Mutation application (path-based atomic write)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function navigateToParent(
  root: Rec,
  segments: string[],
  upsert: boolean
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
        // `boards` is always an array of `{ board, ... }` entries (see Item schema) —
        // the next segment is matched against each entry's `board` property.
        obj[seg] = seg === 'boards' ? [] : {};
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

export function applyMutations(item: Item, mutations: Mutation[], now: string): Item {
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
        if (Array.isArray(cur)) nav.parent[nav.finalKey] = cur.filter((el) => el !== mut.value);
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
