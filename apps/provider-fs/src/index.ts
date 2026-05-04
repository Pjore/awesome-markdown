import { loadConfig } from './config.js';
import { createServer, IndexStore } from './server.js';
import { scanDirectory } from './fs/scanner.js';
import { startWatcher } from './fs/watcher.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Build store before creating the server so the watcher can share the same instance.
  const store = new IndexStore();
  const entities = await scanDirectory(config.contentRoot);
  store.loadFrom(entities);

  const server = await createServer(config, store);
  const stopWatcher = startWatcher(config.contentRoot, store);

  const shutdown = async (): Promise<void> => {
    server.log.info('Shutting down...');
    stopWatcher();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    await server.listen({ host: config.host, port: config.port });
    server.log.info(
      `provider-fs listening on ${config.host}:${config.port} — content: ${config.contentRoot}`,
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

void main();
