import mri from 'mri';
import path from 'node:path';
import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  contentRoot: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load config from CLI flags > env vars > defaults.
 * Precedence: CLI flag > PROVIDER_FS_* env var > built-in default.
 */
export function loadConfig(): Config {
  const argv = mri(process.argv.slice(2), {
    string: ['host', 'content-root'],
    alias: { p: 'port', h: 'host', c: 'content-root' },
  }) as Record<string, unknown>;

  const rawPort =
    argv['port'] !== undefined
      ? argv['port']
      : process.env['PROVIDER_FS_PORT'] !== undefined
        ? Number(process.env['PROVIDER_FS_PORT'])
        : 7701;

  const port = Number(rawPort);
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid port value: ${String(rawPort)}`);
  }

  const host =
    typeof argv['host'] === 'string' && argv['host'].length > 0
      ? argv['host']
      : (process.env['PROVIDER_FS_HOST'] ?? '127.0.0.1');

  const contentRootRaw =
    typeof argv['content-root'] === 'string' && argv['content-root'].length > 0
      ? argv['content-root']
      : (process.env['PROVIDER_FS_CONTENT_ROOT'] ?? './content');

  const contentRoot = path.resolve(contentRootRaw);

  const result = ConfigSchema.safeParse({ port, host, contentRoot });
  if (!result.success) {
    throw new Error(`Invalid config: ${result.error.message}`);
  }

  return result.data;
}
