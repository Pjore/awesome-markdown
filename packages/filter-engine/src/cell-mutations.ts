import type { Board, Axis, FilterRule, Mutation } from '@awesome-markdown/contracts';
import { bindFilter, substitutePath } from './path-resolver.js';
import { deriveMutations } from './mutations.js';

export function cellFilter(board: Board, column: Axis, lane: Axis): FilterRule | undefined {
  const rules = [
    bindFilter(board.filter, { board: board.slug }),
    bindFilter(column.filter, { board: board.slug, axis: column.slug }),
    bindFilter(lane.filter, { board: board.slug, axis: lane.slug }),
  ].filter((r): r is FilterRule => r !== undefined);
  return rules.length ? { all: rules } : undefined;
}

/** Each axis binds independently; explicit writes replace that axis's inversion only. */
export function cellMutations(
  board: Board,
  column: Axis,
  lane: Axis
): Mutation[] | { readonly: true } {
  cellFilter(board, column, lane); // validate all variable bindings, even with overrides
  const results = [
    deriveMutations(board.filter, { board: board.slug }),
    ...[column, lane].map((axis) =>
      deriveMutations(axis.filter, { board: board.slug, axis: axis.slug }, axis.writeOnDrop)
    ),
  ];
  if (results.some((result) => !Array.isArray(result))) return { readonly: true };
  return results
    .flatMap((result) => (Array.isArray(result) ? result : []))
    .map((m) => ({ ...m, path: substitutePath(m.path, { board: board.slug }) }));
}
