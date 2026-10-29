import { unsafeKey } from '@awesome-markdown/contracts';
import type { Item, MutationPath, FilterRule } from '@awesome-markdown/contracts';

export interface Ctx {
  board: string;
  axis?: string;
  [key: string]: unknown;
}
export type Segment = Exclude<MutationPath, string>[number];

export function parsePath(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i]!;
    if (ch === '\\' && (path[i + 1] === '.' || path[i + 1] === '\\')) current += path[++i];
    else if (ch === '.') {
      segments.push(current);
      current = '';
    } else current += ch;
  }
  segments.push(current);
  return segments;
}
export function joinPath(segments: string[]): string {
  return segments.map((s) => s.replace(/\\/g, '\\\\').replace(/\./g, '\\.')).join('.');
}

/** Bound selectors retain the key to match; a board and an axis may share a slug. */
export function substitutePath(path: MutationPath, ctx: Ctx): MutationPath {
  const segments = (typeof path === 'string' ? parsePath(path) : path).map<Segment>((segment) => {
    if (typeof path === 'string' && (segment === '$board' || segment === '$axis')) {
      const selector = segment === '$board' ? 'board' : 'axis';
      const value = ctx[selector];
      if (typeof value !== 'string' || !value)
        throw new Error(`Unbound ${segment} in configuration`);
      return { selector, value };
    }
    if (typeof segment === 'string' && unsafeKey(segment))
      throw new Error(`Unsafe path: ${segment}`);
    return segment;
  });
  return typeof path === 'string' && !segments.some((segment) => typeof segment === 'object')
    ? path
    : segments;
}

export function selectEntry(
  list: unknown[],
  segment: { selector: 'board' | 'axis'; value: string }
): Record<string, unknown> | undefined {
  const matches = list.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      Object.hasOwn(entry, segment.selector) &&
      (entry as Record<string, unknown>)[segment.selector] === segment.value
  );
  if (matches.length > 1)
    throw new Error(
      `Ambiguous ${segment.selector} lookup: ${segment.value}. Remove duplicate entries.`
    );
  return matches[0];
}

export function resolvePath(path: MutationPath, item: Item, ctx: Ctx): unknown {
  const bound = substitutePath(path, ctx);
  const segments = typeof bound === 'string' ? parsePath(bound) : bound;
  let value: unknown = item;
  try {
    for (const segment of segments) {
      if (value === undefined || value === null) return undefined;
      if (typeof segment === 'object') {
        if (!Array.isArray(value)) throw new Error(`Selector ${segment.selector} requires a list`);
        value = selectEntry(value, segment);
      } else if (typeof value === 'object' && Object.hasOwn(value, segment)) {
        if (Array.isArray(value) && typeof segment !== 'number')
          throw new Error('List access requires an index or selector');
        value = (value as Record<string | number, unknown>)[segment];
      } else return undefined;
    }
    return value;
  } catch (error) {
    throw new Error(
      `Item ${item.slug}: ${error instanceof Error ? error.message : 'Path lookup failed'}`,
      { cause: error }
    );
  }
}

export function bindFilter(filter: FilterRule | undefined, ctx: Ctx): FilterRule | undefined {
  if (!filter) return undefined;
  if ('property' in filter) return { ...filter, property: substitutePath(filter.property, ctx) };
  if ('not' in filter) return { not: bindFilter(filter.not, ctx)! };
  if ('all' in filter) return { all: filter.all.map((f) => bindFilter(f, ctx)!) };
  return { any: filter.any.map((f) => bindFilter(f, ctx)!) };
}
