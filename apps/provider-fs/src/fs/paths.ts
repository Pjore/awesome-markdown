import path from 'node:path';
import { RepoError } from '../errors.js';

/** Absolute path to a board's directory. */
export function boardDir(contentRoot: string, boardId: string): string {
  return path.join(contentRoot, 'boards', boardId);
}

/** Absolute path to a board's metadata YAML file. */
export function boardFile(contentRoot: string, boardId: string): string {
  return path.join(boardDir(contentRoot, boardId), 'board.yaml');
}

/** Absolute path to a board's columns YAML file. */
export function columnsFile(contentRoot: string, boardId: string): string {
  return path.join(boardDir(contentRoot, boardId), 'columns.yaml');
}

/** Absolute path to a board's swimlanes YAML file. */
export function swimlanesFile(contentRoot: string, boardId: string): string {
  return path.join(boardDir(contentRoot, boardId), 'swimlanes.yaml');
}

/** Absolute path to a board's items directory. */
export function itemsDir(contentRoot: string, boardId: string): string {
  return path.join(boardDir(contentRoot, boardId), 'items');
}

/** Absolute path to a single item's markdown file. */
export function itemFile(
  contentRoot: string,
  boardId: string,
  itemId: string,
): string {
  return path.join(itemsDir(contentRoot, boardId), `${itemId}.md`);
}

/**
 * Guard against path-traversal attacks.
 * Throws RepoError('io_error') if `target` escapes `root`.
 */
export function assertWithinRoot(root: string, target: string): void {
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new RepoError(
      'io_error',
      `Path traversal attempt: ${target} is outside ${root}`,
    );
  }
}
