import { simpleGit } from 'simple-git';
import type { GitCredentialProvider } from './github-app/index.js';

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
   * Injects the GitHub App installation token as `https://x-access-token:<token>@...`.
   * Returns the plain URL when no credential provider is available or for non-GitHub remotes.
   * Throws `MintFailureError` if the token cannot be minted.
   */
  getAuthenticatedUrl: () => Promise<string>;
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
 * @param repoRoot          Absolute path to the git repository root.
 * @param credentialProvider GitHub App credential provider (or null for local-only / non-GitHub remotes).
 * @param targetBranch      Explicit branch to sync against. When omitted, the
 *                          current local branch is detected via `git branch --show-current`.
 *                          Set this when working on a feature branch so the sync-engine
 *                          pushes/pulls that branch rather than the remote default.
 */
export async function createRemoteConfig(
  repoRoot: string,
  credentialProvider: GitCredentialProvider | null,
  targetBranch?: string,
): Promise<RemoteConfig> {
  const git = simpleGit({ baseDir: repoRoot });

  let originUrl = '';
  let branch = targetBranch ?? 'main';

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

    // Resolve target branch:
    // 1. Use explicit targetBranch override if provided (e.g. from SYNC_ENGINE_TARGET_BRANCH).
    // 2. Otherwise, use the current local branch — this is the correct default for feature
    //    branch workflows where you want to sync your working branch, not origin/HEAD.
    // 3. Final fallback: 'main'.
    if (!targetBranch) {
      try {
        branch = (await git.raw(['branch', '--show-current'])).trim() || 'main';
      } catch {
        branch = 'main';
      }
    }
  }

  await loadFromGit();

  const ownerRepo = parseGitHubOwnerRepo(originUrl);

  return {
    owner: ownerRepo?.owner ?? null,
    repo: ownerRepo?.repo ?? null,
    get branch() {
      return branch;
    },
    get redactedUrl() {
      // Use a static sentinel so this getter stays synchronous.
      if (!credentialProvider) return originUrl;
      if (!originUrl.startsWith('https://')) return originUrl;
      return originUrl.replace(
        /^(https:\/\/)([^@]+@)?/,
        '$1x-access-token:***INSTALLATION_TOKEN***@',
      );
    },
    get originUrl() {
      return originUrl;
    },
    async getAuthenticatedUrl(): Promise<string> {
      if (!credentialProvider || !originUrl) return originUrl;
      if (!originUrl.startsWith('https://')) return originUrl;
      const { token } = await credentialProvider.getInstallationToken();
      return injectToken(originUrl, token);
    },
    async refresh(): Promise<void> {
      await loadFromGit();
    },
  };
}
