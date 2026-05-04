/**
 * @awesome-markdown/filter-engine
 *
 * Isomorphic filter evaluation, invertibility analysis, mutation derivation,
 * and fractional-index ordering helpers.
 *
 * No Node-only or browser-only APIs are imported. Safe for use in both
 * `apps/provider-fs` (Node) and `apps/kanban-ui` (browser).
 */

// Evaluation context (shared across all exported functions)
export type { Ctx } from './path-resolver.js';

// Path helpers (used by consumers that need to inspect or build paths)
export { parsePath, joinPath, resolvePath, substitutePath } from './path-resolver.js';

// Filter evaluation
export { evaluate } from './evaluate.js';

// Invertibility analysis
export type { InvertibilityResult } from './invertibility.js';
export { analyzeInvertibility } from './invertibility.js';

// Mutation derivation
export type { ReadOnly } from './mutations.js';
export { deriveMutations } from './mutations.js';

// Fractional-index order keys
export { compareOrderKeys, keyBetween } from './order-keys.js';
