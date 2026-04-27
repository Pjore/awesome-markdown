import { simpleGit } from 'simple-git';

/**
 * Resolves the remote identity (URL, owner/repo, default branch) for a local
 * git repository. Provides an authenticated URL accessor that injects the
 * GitHub token at call time — the token is never written to git config or logs.
 *
 * Only HTTPS remotes pointing to github.com are supported; SSH remotes are
 * rejected with a descriptive error.
 */

export type RemoteInfo = {
  /** GitHub repository owner (null for non-GitHub remotes). */
  owner: string | null;
  /** GitHub repository name (null for non-GitHub remotes). */
  repo: string | null;
  /** The default/current branch name. */
  branch: string;
  /** The remote origin URL with any token redacted. */
  redactedUrl: string;
  /** The raw origin URL (may be a local file:// path in tests). */
  originUrl: string;
};

export type RemoteConfig = RemoteInfo & {
  /**
   * Returns the authenticated HTTPS URL for use in git commands.
   * Injects token as `https://x-access-token:<token>@...`.
   * Returns the plain URL when no token is available or for non-GitHub remotes.
   */
  getAuthenticatedUrl: () => string;
  /**
   * Re-reads origin URL and current branch from the git repo.
   * Use in tests to reset cached state.
   */
  refresh: () => Promise<void>;
};

/** Replace the token in a URL with a redaction marker. */
export function redactToken(text: string, token: string | null): string {
  if (!token) return text;
  // Escape special regex chars in token
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'g'), '***REDACTED***');
}

/**
 * Inject a GitHub Fine-Grained PAT into an HTTPS GitHub URL.
 * Input:  `https://github.com/owner/repo.git`
 * Output: `https://x-access-token:<token>@github.com/owner/repo.git`
 */
function injectToken(url: string, token: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = 'x-access-token';
    parsed.password = token;
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Parse GitHub owner/repo from an HTTPS or SSH GitHub URL.
 * Returns null for non-GitHub or unrecognised shapes.
 */
function parseGitHubOwnerRepo(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = /github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/.exec(url);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }
  return null;
}

/**
 * Build a RemoteConfig for the given repository.
 *
 * @param repoRoot Absolute path to the git repository root.
 * @param token    GitHub Fine-Grained PAT (or null when unavailable).
 */
export async function createRemoteConfig(
  repoRoot: string,
  token: string | null,
): Promise<RemoteConfig> {
  const git = simpleGit({ baseDir: repoRoot });

  let originUrl = '';
  let branch = 'main';

  async function loadFromGit(): Promise<void> {
    // Resolve origin URL
    try {
      originUrl = (await git.remote(['get-url', 'origin']) ?? '').trim();
    } catch {
      originUrl = '';
    }

    // Reject SSH remotes (github.com:owner/repo.git or git@github.com:...)
    if (originUrl.startsWith('git@') || originUrl.startsWith('ssh://')) {
      throw new Error(
        `[sync-engine] Remote auth only supports HTTPS origins in M7. ` +
        `Found SSH origin: ${originUrl}. ` +
        `Convert with: git remote set-url origin https://github.com/<owner>/<repo>.git`,
      );
    }

    // Resolve default branch: try symbolic-ref, fall back to current branch
    try {
      const symRef = (
        await git.raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
      ).trim();
      // e.g. "origin/main" → "main"
      branch = symRef.replace(/^origin\//, '') || 'main';
    } catch {
      try {
        branch = (await git.raw(['branch', '--show-current'])).trim() || 'main';
      } catch {
        branch = 'main';
      }
    }
  }

  await loadFromGit();

  const ownerRepo = parseGitHubOwnerRepo(originUrl);

  function buildRedactedUrl(): string {
    if (!token) return originUrl;
    return redactToken(originUrl, token);
  }

  return {
    owner: ownerRepo?.owner ?? null,
    repo: ownerRepo?.repo ?? null,
    get branch() {
      return branch;
    },
    get redactedUrl() {
      return buildRedactedUrl();
    },
    get originUrl() {
      return originUrl;
    },
    getAuthenticatedUrl(): string {
      if (!token || !originUrl) return originUrl;
      // Only inject for HTTPS URLs
      if (!originUrl.startsWith('https://')) return originUrl;
      return injectToken(originUrl, token);
    },
    async refresh(): Promise<void> {
      await loadFromGit();
    },
  };
}
