import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { Batch, CommitResult, EngineConfig } from './types.js';

/**
 * Turns a flushed Batch into a local git commit.
 *
 * - Stages only files inside `contentDir` (never uses `add -A`).
 * - Skips the commit if the working tree has no actual diff after staging
 *   (e.g. an atomic-save that only touched mtime).
 * - Returns a CommitResult with the resulting SHA, or `{ noop: true }`.
 */
export class Committer {
  private readonly git: ReturnType<typeof simpleGit>;
  private readonly contentAbsPath: string;

  constructor(private readonly config: EngineConfig) {
    this.git = simpleGit({
      baseDir: config.repoRoot,
      config: [
        `user.name=${config.commitAuthorName}`,
        `user.email=${config.commitAuthorEmail}`,
      ],
    });
    this.contentAbsPath = path.join(config.repoRoot, config.contentDir);
  }

  /**
   * Commit the given batch. All paths must be inside `contentDir`.
   * Throws if a git command fails.
   */
  async commit(
    batch: Batch,
    source: 'self' | 'external' | 'mixed',
  ): Promise<CommitResult> {
    // Filter: only stage paths inside contentDir
    const safeAbsPaths = batch.paths.filter((p) =>
      path.resolve(p).startsWith(this.contentAbsPath),
    );
    const safeRelPaths = safeAbsPaths.map((p) =>
      path.relative(this.config.repoRoot, path.resolve(p)),
    );

    if (safeRelPaths.length === 0) {
      return { noop: true };
    }

    // Stage the files
    await this.git.add(safeRelPaths);

    // Check if there is anything actually staged
    const status = await this.git.status();
    const staged = [
      ...status.created,
      ...status.modified,
      ...status.deleted,
      ...status.renamed.map((r) => r.to),
    ];
    if (staged.length === 0) {
      return { noop: true };
    }

    // Build structured commit message
    const subject = `[sync-engine] ${source}: ${safeRelPaths.length} file(s)`;
    const pathTrailers = safeRelPaths.map((p) => `Path: ${p}`).join('\n');
    const message = [
      subject,
      '',
      pathTrailers,
      `Source: ${source}`,
      `Batch-Id: ${batch.batchId}`,
    ].join('\n');

    // Commit with explicit author
    await this.git.commit(message, {
      '--author': `${this.config.commitAuthorName} <${this.config.commitAuthorEmail}>`,
    });

    // Retrieve the resulting SHA
    const logResult = await this.git.log({ maxCount: 1 });
    const latestEntry = logResult.latest;
    const sha = latestEntry?.hash ?? 'unknown';

    return {
      noop: false,
      sha,
      paths: safeRelPaths,
      source,
      message: subject,
    };
  }

  /**
   * Check for uncommitted changes in contentDir and commit them as a catch-up
   * batch. Used on startup to handle UC-2 (sync-engine was offline).
   * Returns undefined if there is nothing to commit.
   */
  async commitUnstaged(batchId: string): Promise<CommitResult | undefined> {
    const status = await this.git.status();
    const allChanged = [
      ...status.not_added,
      ...status.modified,
      ...status.deleted,
      ...status.created,
      ...status.renamed.map((r) => r.to),
    ].filter((p) => p.startsWith(this.config.contentDir + '/') || p.startsWith(this.config.contentDir + path.sep));

    if (allChanged.length === 0) return undefined;

    // Build a synthetic batch
    const fakeBatch: Batch = {
      batchId,
      paths: allChanged.map((p) => path.join(this.config.repoRoot, p)),
      events: new Map(),
      startTime: Date.now(),
      flushTime: Date.now(),
    };
    return this.commit(fakeBatch, 'external');
  }
}
