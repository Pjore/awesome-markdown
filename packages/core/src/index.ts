// Isomorphic core: no Node-only or browser-only APIs. Markdown
// (de)serialization lives in the `@awesome-markdown/core/markdown` subpath
// because gray-matter depends on Node built-ins (`fs`, `Buffer`).

export { applyMutations } from './apply-mutations.js';

export {
  syntheticAxis,
  compareScalars,
  sortItems,
  isCellReadOnly,
  renderBoard,
  computeHomeless,
} from './render.js';
export type { AxisLookup, RenderBoardInput } from './render.js';
