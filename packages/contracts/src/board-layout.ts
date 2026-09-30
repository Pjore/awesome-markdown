import type { Axis } from './schemas/axis.js';

/**
 * Slug of the axis a render synthesizes when a board declares no columns or
 * no swimlanes, so a board with only one dimension still renders its cells.
 */
export const IMPLICIT_AXIS_SLUG = 'all';

/** Filter-less axis that stands in for an empty `columns` / `swimlanes` list. */
export function implicitAxis(): Axis {
  return { entityType: 'axis', slug: IMPLICIT_AXIS_SLUG, title: 'All', synthetic: true };
}

/** Axes for one board dimension, falling back to the implicit axis when empty. */
export function resolveDimension(
  slugs: string[] | undefined,
  lookup: (slug: string) => Axis
): Axis[] {
  return slugs && slugs.length > 0 ? slugs.map(lookup) : [implicitAxis()];
}

/**
 * Shallow-merge a PATCH body into an entity. Keys set to `null` are removed;
 * keys absent from the patch keep their current value.
 */
export function mergePatch<T extends object>(existing: T, patch: object): T {
  const out: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (value !== undefined) out[key] = value;
  }
  return out as T;
}
