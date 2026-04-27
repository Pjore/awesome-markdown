/**
 * Best-effort classification of whether file writes originated from this
 * engine/sidecar ("self") or from an external process ("external").
 *
 * Usage:
 *  - Call `markSelfWrite(paths, ttlMs)` when this process (or the sidecar)
 *    writes files into `contentDir`.
 *  - Call `classify(paths)` on a flushed batch to determine the source label.
 *
 * In M6, no caller invokes `markSelfWrite`, so all writes default to "external".
 * The sidecar-coordination mechanism is deferred to M7 / a follow-up.
 */
export class SourceClassifier {
  /** Map of absolute path → expiry timestamp (ms since epoch). */
  private readonly selfPaths = new Map<string, number>();

  /**
   * Mark one or more paths as self-authored for `ttlMs` milliseconds.
   * After the TTL, the paths revert to "external" classification.
   *
   * @param paths   Absolute or relative paths to mark.
   * @param ttlMs   How long the mark is valid (default: 2000 ms).
   */
  markSelfWrite(paths: string[], ttlMs = 2000): void {
    const expiry = Date.now() + ttlMs;
    for (const p of paths) {
      this.selfPaths.set(p, expiry);
    }
    // Prune expired entries opportunistically
    this._prune();
  }

  /**
   * Classify a batch of paths as 'self', 'external', or 'mixed'.
   */
  classify(paths: string[]): 'self' | 'external' | 'mixed' {
    this._prune();
    if (paths.length === 0) return 'external';

    let selfCount = 0;
    for (const p of paths) {
      if (this.selfPaths.has(p)) selfCount++;
    }

    if (selfCount === 0) return 'external';
    if (selfCount === paths.length) return 'self';
    return 'mixed';
  }

  private _prune(): void {
    const now = Date.now();
    for (const [p, expiry] of this.selfPaths) {
      if (expiry <= now) {
        this.selfPaths.delete(p);
      }
    }
  }
}
