import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { simpleGit } from 'simple-git';

export type TempRepo = {
  repoRoot: string;
  contentDir: string;
  contentAbsPath: string;
  /** Remove the temp directory (called in afterEach). */
  cleanup: () => Promise<void>;
};

/**
 * Create an OS temp directory containing a fully initialised git repository
 * with a `content/` subdirectory and an initial commit.
 *
 * Local user.name / user.email are set so no global git config is required.
 */
export async function createTempRepo(): Promise<TempRepo> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-engine-test-'));
  const contentDir = 'content';
  const contentAbsPath = path.join(repoRoot, contentDir);

  await fs.mkdir(contentAbsPath, { recursive: true });

  const git = simpleGit({ baseDir: repoRoot });
  await git.init();
  await git.addConfig('user.name', 'Test User', false, 'local');
  await git.addConfig('user.email', 'test@example.com', false, 'local');

  // Seed file so the repo has at least one commit
  const seedPath = path.join(contentAbsPath, 'seed.md');
  await fs.writeFile(
    seedPath,
    '---\nid: seed-1\ntitle: Seed\n---\n\n# Seed\n',
    'utf8',
  );
  await git.add('.');
  await git.commit('chore: initial seed', { '--author': 'Test User <test@example.com>' });

  return {
    repoRoot,
    contentDir,
    contentAbsPath,
    cleanup: async () => {
      if (existsSync(repoRoot)) {
        await fs.rm(repoRoot, { recursive: true, force: true });
      }
    },
  };
}
