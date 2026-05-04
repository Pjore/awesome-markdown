import type { Item } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

/**
 * Context passed to path resolution and filter evaluation.
 * `board` drives the single `$board` substitution variable.
 * Additional optional fields may be present and are ignored.
 */
export interface Ctx {
  /** Slug of the board currently being rendered. Drives `$board` substitution. */
  board: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

/**
 * Parse a dotted-path string into an ordered array of segments.
 *
 * Dot (`.`) is the segment separator.
 * A backslash-escaped dot (`\.`) is a literal dot within a segment.
 *
 * Examples:
 *   "status"             → ["status"]
 *   "boards.$board.order" → ["boards", "$board", "order"]
 *   "a\\.b.c"            → ["a.b", "c"]
 */
export function parsePath(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path.charAt(i);
    const next = path.charAt(i + 1);
    if (ch === '\\' && next === '.') {
      current += '.';
      i++; // consume the escaped dot
    } else if (ch === '.') {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments;
}

/**
 * Reconstruct a dotted-path string from an array of segments,
 * re-escaping any literal dots within segment names.
 */
export function joinPath(segments: string[]): string {
  return segments.map(s => s.replace(/\./g, '\\.')).join('.');
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted path against an item, substituting `$board` from ctx.
 *
 * Rules:
 * - Missing intermediate keys return `undefined` (never throws).
 * - When the current value is an array and the segment matches the `board`
 *   property of an entry, that entry object is selected (boards[] lookup).
 * - `$board` is substituted with `ctx.board` before the array lookup.
 * - Returns the raw value; `undefined` and `null` are distinct.
 */
export function resolvePath(path: string, item: Item, ctx: Ctx): unknown {
  const segments = parsePath(path);
  let value: unknown = item;
  for (const seg of segments) {
    const key = seg === '$board' ? ctx.board : seg;
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      // boards[] lookup: find entry whose `board` property equals the key
      const entry = (value as unknown[]).find(
        (el): el is Record<string, unknown> =>
          typeof el === 'object' &&
          el !== null &&
          'board' in (el as object) &&
          (el as Record<string, unknown>)['board'] === key,
      );
      value = entry;
    } else if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * Resolve the `$board` substitution variable in a path's segments and
 * return the resulting dotted-path string.
 *
 * Used when producing mutation paths from filter rules: the mutation paths
 * sent to providers contain the actual board slug (not `$board`).
 */
export function substitutePath(path: string, ctx: Ctx): string {
  return joinPath(parsePath(path).map(seg => (seg === '$board' ? ctx.board : seg)));
}
