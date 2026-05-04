import type { ConflictState, ResolveDecision, ConflictPathEntry } from '@awesome-markdown/contracts';
import { randomUUID } from 'node:crypto';
import type { PathContent } from './content-extractor.js';

/**
 * Internal representation of an active conflict session.
 * Never serialised to disk — lives only for the duration of a merge conflict.
 */
export interface ConflictSessionData {
  mergeId: string;
  startedAt: string;
  /** Repo-relative paths in conflict. */
  paths: string[];
  /** Recorded decisions for each path. */
  decisions: Record<string, ResolveDecision>;
  repoRoot: string;
  branch: string;
  /** Temp directories created for this session (inject endpoint). */
  tempDirs: string[];
  status: 'awaiting' | 'completing' | 'completed';
  /** Per-path ours/theirs content extracted from git index stages. */
  content: Record<string, PathContent>;
}

/**
 * Singleton manager for the active merge conflict session.
 *
 * At most one conflict session may exist at a time (single in-flight merge
 * invariant). Creation fails if another non-completed session is active.
 */
export class ConflictSessionManager {
  private session: ConflictSessionData | null = null;
  /** Track the most-recently completed mergeId for idempotent re-submits. */
  private lastCompletedId: string | null = null;

  /**
   * Create a new conflict session.
   * Throws if a non-completed session already exists.
   */
  create(params: {
    repoRoot: string;
    branch: string;
    paths: string[];
    tempDirs?: string[];
    content: Record<string, PathContent>;
  }): ConflictSessionData {
    if (this.session && this.session.status !== 'completed') {
      throw new Error(
        `[conflict-session] Cannot create a new session: merge "${this.session.mergeId}" is still active`,
      );
    }
    const session: ConflictSessionData = {
      mergeId: randomUUID(),
      startedAt: new Date().toISOString(),
      paths: [...params.paths],
      decisions: {},
      repoRoot: params.repoRoot,
      branch: params.branch,
      tempDirs: params.tempDirs ?? [],
      status: 'awaiting',
      content: params.content,
    };
    this.session = session;
    return session;
  }

  getActive(): ConflictSessionData | null {
    if (!this.session || this.session.status === 'completed') return null;
    return this.session;
  }

  /** Returns true if the given mergeId is the most-recently completed one. */
  wasCompleted(mergeId: string): boolean {
    return this.lastCompletedId === mergeId;
  }

  /** Record a decision for a path. Returns false if path is not in the session. */
  recordDecision(filePath: string, decision: ResolveDecision): boolean {
    if (!this.session || this.session.status === 'completed') return false;
    if (!this.session.paths.includes(filePath)) return false;
    this.session.decisions[filePath] = decision;
    return true;
  }

  isAffected(filePath: string): boolean {
    if (!this.session || this.session.status === 'completed') return false;
    return this.session.paths.includes(filePath);
  }

  /**
   * Returns paths that don't yet have a staged ours/theirs resolution.
   * ('external' decisions and undecided paths are both pending.)
   */
  getPendingPaths(): string[] {
    if (!this.session || this.session.status === 'completed') return [];
    return this.session.paths.filter(
      (p) => {
        const d = this.session!.decisions[p];
        return d === undefined || d === 'external';
      },
    );
  }

  /** Mark session as completing (merge commit in progress). */
  setCompleting(): void {
    if (this.session) this.session.status = 'completing';
  }

  /**
   * Mark session as completed and clear it.
   * Returns the list of temp dirs to clean up.
   */
  complete(): string[] {
    const dirs = this.session?.tempDirs ?? [];
    if (this.session) {
      this.lastCompletedId = this.session.mergeId;
      this.session.status = 'completed';
      this.session = null;
    }
    return dirs;
  }

  /**
   * Unconditionally clear the session (used by clearConflictState).
   * Returns temp dirs to clean up.
   */
  clear(): string[] {
    const dirs = this.session?.tempDirs ?? [];
    if (this.session) {
      this.lastCompletedId = this.session.mergeId;
    }
    this.session = null;
    return dirs;
  }

  /** Convert active session to the public ConflictState API shape. */
  toConflictState(): ConflictState | null {
    const s = this.getActive();
    if (!s) return null;
    const entries: ConflictPathEntry[] = s.paths.map((p) => {
      const c = s.content[p];
      return {
        path: p,
        oursLabel: 'HEAD',
        theirsLabel: `origin/${s.branch}`,
        decision: s.decisions[p] ?? null,
        oursContent: c?.ours ?? '',
        theirsContent: c?.theirs ?? '',
        oursTruncated: c?.oursTruncated ?? false,
        theirsTruncated: c?.theirsTruncated ?? false,
      };
    });
    return {
      mergeId: s.mergeId,
      startedAt: s.startedAt,
      paths: entries,
      pendingPaths: this.getPendingPaths(),
    };
  }
}
