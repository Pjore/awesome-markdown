import { loadConfig } from './config.js';
import { start } from './server.js';

const config = loadConfig();
await start(config);
