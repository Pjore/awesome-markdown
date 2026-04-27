import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = await createServer(config);

  const shutdown = async (): Promise<void> => {
    server.log.info('Shutting down...');
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
