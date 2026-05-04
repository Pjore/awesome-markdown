import chokidar from 'chokidar';
import path from 'node:path';
import { parseFile } from './scanner.js';
import type { IndexStore } from './index-store.js';
import { bus } from '../events/bus.js';

/**
 * Start a chokidar watcher on `contentRoot/**\/*.md`.
 *
 * On add/change: parses the file, upserts (or removes if unparseable) the
 * entity from the index, and emits a change event on the SSE bus.
 *
 * On unlink: removes the entity from the index and emits a change event.
 *
 * `ignoreInitial: true` — the initial scan is performed by scanDirectory
 * at server startup; the watcher only tracks subsequent changes.
 *
 * Returns a stop function that closes the watcher.
 */
export function startWatcher(contentRoot: string, store: IndexStore): () => void {
  const watcher = chokidar.watch(path.join(contentRoot, '**', '*.md'), {
    ignoreInitial: true,
    persistent: true,
  });

  const handleChange = async (filePath: string): Promise<void> => {
    const entity = await parseFile(filePath);
    if (!entity) {
      store.removeByFilePath(filePath);
    } else if (entity.entityType === 'item') {
      store.upsertItem(entity.slug, entity.data, filePath);
    } else if (entity.entityType === 'board') {
      store.upsertBoard(entity.slug, entity.data, filePath);
    } else {
      store.upsertAxis(entity.slug, entity.data, filePath);
    }
    bus.publish({ type: 'change', path: path.relative(contentRoot, filePath) });
  };

  watcher.on('add', (filePath: string) => void handleChange(filePath));
  watcher.on('change', (filePath: string) => void handleChange(filePath));
  watcher.on('unlink', (filePath: string) => {
    store.removeByFilePath(filePath);
    bus.publish({ type: 'change', path: path.relative(contentRoot, filePath) });
  });

  return () => void watcher.close();
}
