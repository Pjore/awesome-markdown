import type { FilterLeaf, FilterRule } from '@awesome-markdown/contracts';

export type CondOp =
  | 'equals'
  | 'in'
  | 'has'
  | 'lacks'
  | 'exists'
  | 'missing'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'matches';

export const COND_OPS: ReadonlyArray<[CondOp, string]> = [
  ['equals', 'is'],
  ['in', 'is one of'],
  ['has', 'contains'],
  ['lacks', "doesn't contain"],
  ['exists', 'is set'],
  ['missing', 'is not set'],
  ['gt', '>'],
  ['gte', '≥'],
  ['lt', '<'],
  ['lte', '≤'],
  ['matches', 'matches regex'],
];

export interface CondDraft {
  property: string;
  op: CondOp;
  value: string;
  /** Original typed value, reused on save when the text is unchanged. */
  original?: unknown;
}

export interface FilterDraft {
  combinator: 'all' | 'any';
  conds: CondDraft[];
}

const LEAF_KEYS = [
  'equals',
  'in',
  'has',
  'lacks',
  'exists',
  'gt',
  'gte',
  'lt',
  'lte',
  'matches',
] as const;

function leafToCond(leaf: FilterLeaf): CondDraft {
  const rec = leaf as unknown as Record<string, unknown>;
  const key = LEAF_KEYS.find((k) => k in rec) ?? 'equals';
  const raw = rec[key];
  if (key === 'exists')
    return { property: leaf.property, op: raw === false ? 'missing' : 'exists', value: '' };
  if (key === 'in')
    return {
      property: leaf.property,
      op: 'in',
      value: (raw as unknown[]).join(', '),
      original: raw,
    };
  return { property: leaf.property, op: key, value: String(raw), original: raw };
}

function isLeaf(rule: FilterRule): rule is FilterLeaf {
  return 'property' in rule;
}

/** Flat draft for the builder, or `null` when the rule nests groups / `not`. */
export function toDraft(rule: FilterRule | undefined): FilterDraft | null {
  if (!rule) return { combinator: 'all', conds: [] };
  if (isLeaf(rule)) return { combinator: 'all', conds: [leafToCond(rule)] };
  if ('all' in rule && rule.all.every(isLeaf))
    return { combinator: 'all', conds: rule.all.map(leafToCond) };
  if ('any' in rule && rule.any.every(isLeaf))
    return { combinator: 'any', conds: rule.any.map(leafToCond) };
  return null;
}

function typedValue(cond: CondDraft): string | number {
  if (cond.original !== undefined && String(cond.original) === cond.value)
    return cond.original as string | number;
  const numeric = /^-?\d+(\.\d+)?$/.test(cond.value.trim());
  const comparison = cond.op === 'gt' || cond.op === 'gte' || cond.op === 'lt' || cond.op === 'lte';
  return numeric && comparison ? Number(cond.value) : cond.value;
}

function condToLeaf(cond: CondDraft): FilterLeaf {
  const property = cond.property.trim();
  switch (cond.op) {
    case 'exists':
      return { property, exists: true };
    case 'missing':
      return { property, exists: false };
    case 'in':
      return {
        property,
        in: cond.value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      };
    case 'equals':
      return { property, equals: typedValue(cond) };
    case 'matches':
      return { property, matches: cond.value };
    default:
      return { property, [cond.op]: typedValue(cond) } as FilterLeaf;
  }
}

/** Rule for the draft; `undefined` when no complete condition remains. */
export function fromDraft(draft: FilterDraft): FilterRule | undefined {
  const leaves = draft.conds.filter((c) => c.property.trim() !== '').map(condToLeaf);
  if (leaves.length === 0) return undefined;
  if (leaves.length === 1) return leaves[0];
  return draft.combinator === 'any' ? { any: leaves } : { all: leaves };
}

function condText(c: CondDraft): string {
  const label = COND_OPS.find(([op]) => op === c.op)?.[1] ?? c.op;
  return c.op === 'exists' || c.op === 'missing'
    ? `${c.property} ${label}`
    : `${c.property} ${label} ${c.value}`;
}

/** One-line human summary, e.g. `status is todo or status is done`. */
export function filterSummary(rule: FilterRule | undefined, none = 'all cards'): string {
  const draft = toDraft(rule);
  if (!draft) return 'custom filter';
  if (draft.conds.length === 0) return none;
  return draft.conds.map(condText).join(draft.combinator === 'any' ? ' or ' : ' and ');
}
