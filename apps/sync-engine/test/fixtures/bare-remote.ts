import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { simpleGit } from 'simple-git';

/**
 * A local bare git repository that acts as the remote in tests.
 * Provides two working clones:
 *  - `engineClone`:       the repo the sync-engine uses
 *  - `collaboratorClone`: a second clone used to simulate external pushes
 */
export type BareRemote = {
  /** Absolute path to the bare repository. */
  barePath: string;
  /** file:// URL for the bare repo (used as remote URL in git commands). */
  bareUrl: string;
  /** Absolute path of the engine's working clone. */
  engineClone: string;
  /** Absolute path of the collaborator's working clone. */
  collaboratorClone: string;
  /** The initial branch name (e.g. "main"). */
  branch: string;
  /** Remove all temp directories. Call in afterEach. */
  cleanup: () => Promise<void>;
};

/**
 * Create a bare remote + two working clones for integration tests.
 *
 * Layout:
 *   <tmpDir>/
 *     bare.git/         ← bare remote
 *     engine/           ← sync-engine's working clone, has content/ dir
 *     collaborator/     ← second clone for simulating external pushes
 *
 * Both clones start from the same seed commit with a `content/seed.md` file.
 */
export async function createBareRemote(): Promise<BareRemote> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-engine-remote-'));

  const barePath = path.join(tmpDir, 'bare.git');
  const engineClone = path.join(tmpDir, 'engine');
  const collaboratorClone = path.join(tmpDir, 'collaborator');

  // 1. Init bare repo
  await fs.mkdir(barePath, { recursive: true });
  const bareGit = simpleGit({ baseDir: barePath });
  await bareGit.init(['--bare', '--initial-branch=main']);

  const bareUrl = `file://${barePath}`;
  const branch = 'main';

  // Helper: configure git identity in a repo
  async function configureGit(repoPath: string, name: string, email: string) {
    const g = simpleGit({ baseDir: repoPath });
    await g.addConfig('user.name', name, false, 'local');
    await g.addConfig('user.email', email, false, 'local');
    return g;
  }

  // 2. Create engine clone
  await fs.mkdir(engineClone, { recursive: true });
  const engineGit = simpleGit({ baseDir: tmpDir });
  await engineGit.clone(bareUrl, engineClone);

  const egit = await configureGit(engineClone, 'Engine', 'engine@local');

  // Ensure we're on the main branch
  try { await egit.checkout(['-b', branch]); } catch { /* already exists */ }

  // Create content directory with a seed file
  const engineContentDir = path.join(engineClone, 'content');
  await fs.mkdir(engineContentDir, { recursive: true });
  await fs.writeFile(
    path.join(engineContentDir, 'seed.md'),
    '---\nid: seed-1\ntitle: Seed\n---\n\n# Seed\n',
    'utf8',
  );
  await egit.add('.');
  await egit.commit('chore: initial seed');
  await egit.raw(['push', 'origin', `${branch}:${branch}`]);

  // 3. Create collaborator clone
  const cGit = simpleGit({ baseDir: tmpDir });
  await cGit.clone(bareUrl, collaboratorClone);
  await configureGit(collaboratorClone, 'Collaborator', 'collab@local');

  return {
    barePath,
    bareUrl,
    engineClone,
    collaboratorClone,
    branch,
    cleanup: async () => {
      if (existsSync(tmpDir)) {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Get the HEAD SHA of the given branch in a bare repo.
 */
export async function getBareHeadSha(
  barePath: string,
  branch: string,
): Promise<string> {
  const git = simpleGit({ baseDir: barePath });
  return (await git.revparse([branch])).trim();
}
