import path from 'node:path';
import fs from 'node:fs/promises';
import { createTempRepo } from './tempRepo.js';
import { createServer } from '../../src/server.js';
import type { TempRepo } from './tempRepo.js';
import type { EngineConfig } from '../../src/types.js';

export type EngineHarness = {
  baseUrl: string;
  port: number;
  repoRoot: string;
  contentAbsPath: string;
  /** Write a file into content/ and return its absolute path. */
  writeFile: (name: string, content?: string) => Promise<string>;
  /** Delete a file from content/. */
  deleteFile: (name: string) => Promise<void>;
  /**
   * Wait for at least `count` commits beyond the initial seed commit.
   * Polls the git log until satisfied or times out.
   */
  waitForCommits: (count: number, timeoutMs?: number) => Promise<string[]>;
  /** Stop the engine and server, then clean up the temp repo. */
  stop: () => Promise<void>;
};

/**
 * Spin up a fully wired Engine + Fastify server pointing at a fresh temp git
 * repo. Uses an ephemeral port (port 0) to avoid conflicts in CI.
 *
 * @param debounceMs Override debounce window (default: 120 ms for fast tests).
 */
export async function createEngineHarness(debounceMs = 120): Promise<EngineHarness> {
  const repo: TempRepo = await createTempRepo();

  const config: EngineConfig = {
    repoRoot: repo.repoRoot,
    contentDir: repo.contentDir,
    commitAuthorName: 'sync-test',
    commitAuthorEmail: 'sync-test@local',
    debounceMs,
    port: 0, // ephemeral port
    host: '127.0.0.1',
  };

  const server = await createServer(config);
  await server.listen({ port: 0, host: '127.0.0.1' });

  const addrs = server.addresses();
  const addr = addrs[0];
  if (!addr) throw new Error('Server did not bind to any address');
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    port,
    repoRoot: repo.repoRoot,
    contentAbsPath: repo.contentAbsPath,

    writeFile: async (name, content) => {
      const filePath = path.join(repo.contentAbsPath, name);
      await fs.writeFile(
        filePath,
        content ?? `---\nid: ${name}\ntitle: ${name}\n---\n\n# ${name}\n`,
        'utf8',
      );
      return filePath;
    },

    deleteFile: async (name) => {
      const filePath = path.join(repo.contentAbsPath, name);
      await fs.unlink(filePath).catch(() => undefined);
    },

    waitForCommits: async (count, timeoutMs = 10000) => {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit({ baseDir: repo.repoRoot });
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const log = await git.log({ maxCount: count + 1 });
        // Subtract 1 for the seed commit
        const syncCommits = log.all.filter((e) =>
          e.message.includes('[sync-engine]'),
        );
        if (syncCommits.length >= count) {
          return syncCommits.map((e) => e.hash);
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      throw new Error(`Timed out waiting for ${count} sync-engine commit(s)`);
    },

    stop: async () => {
      await server.close();
      await repo.cleanup();
    },
  };
}
