import path from 'node:path';
import fs from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import type { InjectConflictRequest } from '@awesome-markdown/contracts';
import type { ConflictSessionManager } from './session.js';
import type { SseHub } from '../sse-hub.js';
import { extractConflictContent } from './content-extractor.js';

/**
 * Test-only: inject a deterministic merge conflict into the engine's working tree.
 *
 * Only available when SYNC_ENGINE_TEST_HOOKS=1.
 *
 * Conflict creation using local branches (no temp bare repos needed):
 *  1. Record current HEAD as common base.
 *  2. Create a temp branch `inject-theirs` at base.
 *  3. Checkout `inject-theirs`, write `theirsContent`, commit.
 *  4. Return to original branch.
 *  5. Write `oursContent` to working tree, commit (both sides diverge from base).
 *  6. Attempt `git merge inject-theirs` → produces conflict markers.
 *  7. Parse `git status` for conflicted paths, create session, emit SSE event.
 *  8. Clean up the temp branch regardless of outcome.
 */
export async function injectConflict(params: {
  req: InjectConflictRequest;
  repoRoot: string;
  contentDir: string;
  commitAuthorName: string;
  commitAuthorEmail: string;
  sessionManager: ConflictSessionManager;
  hub: SseHub;
}): Promise<string /* mergeId */> {
  const { req, repoRoot, contentDir, commitAuthorName, commitAuthorEmail, sessionManager, hub } = params;

  const authorConfig = [`user.name=${commitAuthorName}`, `user.email=${commitAuthorEmail}`];
  const egit = simpleGit({ baseDir: repoRoot, config: authorConfig });

  const originalBranch = (await egit.raw(['branch', '--show-current'])).trim() || 'main';
  const contentAbsPath = path.join(repoRoot, contentDir);
  const tmpBranch = `inject-theirs-${Date.now()}`;

  let conflictedPaths: string[] = [];

  try {
    // 1. Create temp branch at current HEAD for the "theirs" side
    await egit.raw(['checkout', '-b', tmpBranch]);

    // 2. Write theirs content and commit on tmpBranch
    for (const [relPath, content] of Object.entries(req.theirsContent)) {
      const absPath = path.join(repoRoot, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content, 'utf8');
    }
    await egit.add('.');
    await egit.commit('[inject] theirs side');

    // 3. Return to original branch
    await egit.checkout(originalBranch);

    // 4. Write ours content and commit on original branch — both branches now diverge from base
    for (const [relPath, content] of Object.entries(req.oursContent)) {
      const absPath = path.join(repoRoot, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content, 'utf8');
    }
    await egit.add('.');
    await egit.commit('[inject] ours side');

    // 5. Attempt merge of theirs branch → should produce conflict markers
    let mergeOutput = '';
    let mergeThrew = false;
    try {
      mergeOutput = await egit.raw(['merge', tmpBranch]);
    } catch (mergeErr) {
      mergeThrew = true;
      mergeOutput = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
    }

    // Detect conflict from either thrown error or stdout (simpleGit may not throw on conflict)
    const isConflictOutput =
      mergeOutput.toLowerCase().includes('conflict') ||
      mergeOutput.toLowerCase().includes('automatic merge failed') ||
      mergeOutput.toLowerCase().includes('fix conflicts') ||
      mergeOutput.toLowerCase().includes('merge failed');

    const isUnrelatedError = mergeThrew && !isConflictOutput;

    if (isUnrelatedError) {
      throw new Error(`[inject] Unexpected merge error: ${mergeOutput.slice(0, 200)}`);
    }

    // Check git status for conflicted paths
    const status = await egit.status();
    conflictedPaths = status.conflicted.filter((p) => {
      const abs = path.resolve(repoRoot, p);
      return abs.startsWith(contentAbsPath + path.sep) ||
             abs.startsWith(contentAbsPath + '/');
    });

    // Fallback: use the requested paths if git status doesn't show them
    if (conflictedPaths.length === 0) {
      // If merge succeeded cleanly (no conflict in output), throw
      if (!isConflictOutput) {
        throw new Error('[inject] Merge completed without conflicts — check ours/theirs content');
      }
      conflictedPaths = req.paths;
    }

    // 6. Create session and emit event
    // Use extractor to read git index stages 2/3 (populated by the merge above).
    const content = await extractConflictContent({ repoRoot, paths: conflictedPaths });
    const session = sessionManager.create({
      repoRoot,
      branch: originalBranch,
      paths: conflictedPaths,
      content,
    });

    hub.broadcast({
      type: 'conflict',
      paths: conflictedPaths,
      diffHunks: conflictedPaths.map(() => ''),
      mergeId: session.mergeId,
    });

    return session.mergeId;
  } finally {
    // Clean up temp branch (ignore errors if it doesn't exist or can't be deleted)
    egit.raw(['branch', '-D', tmpBranch]).catch(() => {});
  }
}


