import { ItemSchema, MutationSchema, SYSTEM_KEYS, unsafeKey } from '@awesome-markdown/contracts';
import type { Item, Mutation } from '@awesome-markdown/contracts';
import { parsePath, selectEntry } from '@awesome-markdown/filter-engine';

type Rec = Record<string | number, unknown>;
type Segment = string | number | { selector: 'board' | 'axis'; value: string };

function navigate(
  root: Rec,
  segments: Segment[],
  upsert: boolean
): { parent: Rec; key: string | number } | null {
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    if (typeof segment === 'object') {
      if (!Array.isArray(current)) throw new Error('Selector requires a list');
      let entry = selectEntry(current, segment);
      if (!entry) {
        if (!upsert) return null;
        entry = { [segment.selector]: segment.value };
        current.push(entry);
      }
      current = entry;
    } else {
      if (current === null || typeof current !== 'object')
        throw new Error('Incompatible path: expected a container');
      if (Array.isArray(current) && (typeof segment !== 'number' || segment >= current.length))
        throw new Error('Invalid list index');
      const object = current as Rec;
      if (!Object.hasOwn(object, segment)) {
        if (!upsert) return null;
        const next = segments[i + 1];
        if (typeof next === 'number') throw new Error('Cannot invent list entries');
        object[segment] = typeof next === 'object' ? [] : {};
      }
      current = object[segment];
    }
  }
  const key = segments.at(-1)!;
  if (typeof key === 'object' || current === null || typeof current !== 'object')
    throw new Error('Invalid mutation target');
  if (Array.isArray(current) && (typeof key !== 'number' || key > current.length))
    throw new Error('Invalid list index');
  return { parent: current as Rec, key };
}

/** A batch is applied to an isolated clone and validated completely before persistence. */
export function applyMutations(
  item: Item,
  mutations: Mutation[],
  now = new Date().toISOString()
): Item {
  const clone = structuredClone(item) as Rec;
  for (const raw of mutations) {
    const mutation = MutationSchema.parse(raw);
    const segments = typeof mutation.path === 'string' ? parsePath(mutation.path) : mutation.path;
    if (
      segments.some(
        (s) =>
          typeof s === 'string' &&
          (unsafeKey(s) || (typeof mutation.path === 'string' && (s === '$board' || s === '$axis')))
      )
    )
      throw new Error('Unsafe or unbound mutation path');
    if (SYSTEM_KEYS.includes(segments[0] as (typeof SYSTEM_KEYS)[number]))
      throw new Error('System metadata is read-only');
    const nav = navigate(clone, segments, mutation.op === 'set' || mutation.op === 'append');
    if (!nav) continue;
    const { parent, key } = nav;
    const current = parent[key];
    if (mutation.op === 'set') parent[key] = structuredClone(mutation.value);
    if (mutation.op === 'delete') {
      if (Array.isArray(parent)) parent.splice(key as number, 1);
      else delete parent[key];
    }
    if (mutation.op === 'append') {
      if (segments.length === 1 && key === 'body') {
        if (current !== undefined && typeof current !== 'string')
          throw new Error('Body must be text');
        parent[key] = current ? `${current}\n\n${mutation.value}` : String(mutation.value);
      } else {
        if (current !== undefined && !Array.isArray(current))
          throw new Error('Append requires a list');
        const list = (current ?? []) as unknown[];
        if (!list.includes(mutation.value)) list.push(mutation.value);
        parent[key] = list;
      }
    }
    if (mutation.op === 'remove') {
      if (current !== undefined && !Array.isArray(current))
        throw new Error('Remove requires a list');
      if (Array.isArray(current)) parent[key] = current.filter((value) => value !== mutation.value);
    }
  }
  clone.updatedAt = now;
  if (!Object.hasOwn(clone, 'body')) clone.body = '';
  return ItemSchema.parse(clone);
}
