import { simpleGit } from 'simple-git';

/** 16 KB per side — matches the cap used in conflict-detector.ts. */
const MAX_CONTENT_BYTES = 16 * 1024;

export interface PathContent {
  ours: string;
  theirs: string;
  oursTruncated: boolean;
  theirsTruncated: boolean;
}

/**
 * Extract ours (stage 2) and theirs (stage 3) content for each conflicting
 * path from the git index after a failed merge.
 *
 * Each side is capped at 16 KB (UTF-8 bytes). Missing stages (e.g. add/add
 * or delete/modify edge cases) yield an empty string with `truncated: false`.
 * Per-path read failures are logged and yield empty strings — never throws.
 */
export async function extractConflictContent(params: {
  repoRoot: string;
  paths: string[];
}): Promise<Record<string, PathContent>> {
  const { repoRoot, paths } = params;
  const git = simpleGit({ baseDir: repoRoot });
  const result: Record<string, PathContent> = {};

  for (const filePath of paths) {
    let ours = '';
    let theirs = '';
    let oursTruncated = false;
    let theirsTruncated = false;

    try {
      ours = await git.raw(['show', `:2:${filePath}`]);
    } catch (err) {
      // Stage 2 missing (e.g. added on their side only)
      console.warn(`[content-extractor] stage 2 unavailable for ${filePath}:`, err instanceof Error ? err.message : err);
    }

    try {
      theirs = await git.raw(['show', `:3:${filePath}`]);
    } catch (err) {
      // Stage 3 missing (e.g. added on our side only)
      console.warn(`[content-extractor] stage 3 unavailable for ${filePath}:`, err instanceof Error ? err.message : err);
    }

    if (Buffer.byteLength(ours) > MAX_CONTENT_BYTES) {
      ours = Buffer.from(ours).slice(0, MAX_CONTENT_BYTES).toString('utf8');
      oursTruncated = true;
    }

    if (Buffer.byteLength(theirs) > MAX_CONTENT_BYTES) {
      theirs = Buffer.from(theirs).slice(0, MAX_CONTENT_BYTES).toString('utf8');
      theirsTruncated = true;
    }

    result[filePath] = { ours, theirs, oursTruncated, theirsTruncated };
  }

  return result;
}
