import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import type { BareRemote } from './bare-remote.js';

/**
 * Helpers for seeding a divergent (conflict) state in the bare remote fixture.
 *
 * A conflict state is produced when:
 *   1. Engine's clone has a local commit modifying file X (not yet pushed).
 *   2. Collaborator's clone modifies the same line in file X, commits, and
 *      pushes to the bare remote.
 *
 * When the engine then tries `git fetch` + `git merge --ff-only`, the merge
 * will fail with "not possible to fast-forward" because the two branches have
 * diverged from their common ancestor.
 */

/**
 * Seed a conflict:
 *  - Creates or overwrites `filename` in both clones with different content.
 *  - Commits in the engine clone (local only, not pushed).
 *  - Commits AND pushes in the collaborator clone.
 *
 * After this call, the engine's next pull will produce `cannot-fast-forward`.
 *
 * @param remote   The BareRemote fixture.
 * @param filename File name relative to the `content/` directory.
 * @returns        The commit SHAs on each side: { engineSha, collaboratorSha }.
 */
export async function seedConflict(
  remote: BareRemote,
  filename: string = 'conflict-target.md',
): Promise<{ engineSha: string; collaboratorSha: string }> {
  const relPath = `content/${filename}`;

  // Write different content to both sides
  const engineContent =
    `---\nid: conflict-1\ntitle: Engine Version\n---\n\n# Engine edit\n`;
  const collabContent =
    `---\nid: conflict-1\ntitle: Collaborator Version\n---\n\n# Collaborator edit\n`;

  // Engine clone: write & commit locally (do NOT push)
  const engineFilePath = path.join(remote.engineClone, relPath);
  await fs.mkdir(path.dirname(engineFilePath), { recursive: true });
  await fs.writeFile(engineFilePath, engineContent, 'utf8');
  const egit = simpleGit({ baseDir: remote.engineClone });
  await egit.add(relPath);
  await egit.commit(`[sync-engine] conflict seed: engine side`);
  const engineLog = await egit.log({ maxCount: 1 });
  const engineSha = engineLog.latest?.hash ?? '';

  // Collaborator clone: write & commit & push
  const collabFilePath = path.join(remote.collaboratorClone, relPath);
  await fs.mkdir(path.dirname(collabFilePath), { recursive: true });
  await fs.writeFile(collabFilePath, collabContent, 'utf8');
  const cgit = simpleGit({ baseDir: remote.collaboratorClone });
  await cgit.add(relPath);
  await cgit.commit(`conflict seed: collaborator side`);
  await cgit.raw(['push', 'origin', `${remote.branch}:${remote.branch}`]);
  const collabLog = await cgit.log({ maxCount: 1 });
  const collaboratorSha = collabLog.latest?.hash ?? '';

  return { engineSha, collaboratorSha };
}

/**
 * Read the HEAD SHA in the engine's working clone.
 */
export async function getEngineHeadSha(remote: BareRemote): Promise<string> {
  const git = simpleGit({ baseDir: remote.engineClone });
  return (await git.revparse(['HEAD'])).trim();
}

/**
 * Read the content of a file in the engine's working clone.
 * Returns null if the file doesn't exist.
 */
export async function readEngineFile(
  remote: BareRemote,
  relPath: string,
): Promise<string | null> {
  const absPath = path.join(remote.engineClone, relPath);
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}
