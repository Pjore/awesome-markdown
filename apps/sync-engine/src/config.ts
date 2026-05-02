import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { EngineConfigSchema } from './config.schema.js';
import type { EngineConfig } from './types.js';

/** Environment variable prefix for sync-engine config. */
const ENV_PREFIX = 'SYNC_ENGINE_';

/** Read an optional JSON config file and return its raw fields (or {}). */
function readConfigFile(repoRoot: string): Record<string, unknown> {
  const configPath = path.join(repoRoot, '.awesome-markdown', 'sync.config.json');
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed config file — ignore and use defaults
  }
  return {};
}

/** Collect env vars with the SYNC_ENGINE_ prefix into a partial config object. */
function collectEnvVars(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const envMap: Record<string, string> = {
    REPO_ROOT: 'repoRoot',
    CONTENT_DIR: 'contentDir',
    COMMIT_AUTHOR_NAME: 'commitAuthorName',
    COMMIT_AUTHOR_EMAIL: 'commitAuthorEmail',
    DEBOUNCE_MS: 'debounceMs',
    PORT: 'port',
    HOST: 'host',
    TARGET_BRANCH: 'targetBranch',
  };
  for (const [envSuffix, configKey] of Object.entries(envMap)) {
    const envKey = `${ENV_PREFIX}${envSuffix}`;
    const value = process.env[envKey];
    if (value !== undefined) {
      result[configKey] = value;
    }
  }

  // Remote-sync env vars (nested under `remote`)
  const remoteFields: Record<string, unknown> = {};
  const remoteEnvMap: Record<string, string> = {
    REMOTE_PULL_INTERVAL_MS: 'pullIntervalMs',
    REMOTE_PUSH_TIMEOUT_MS: 'pushTimeoutMs',
    REMOTE_ENABLED: 'enabled',
  };
  let hasRemote = false;
  for (const [envSuffix, configKey] of Object.entries(remoteEnvMap)) {
    const envKey = `${ENV_PREFIX}${envSuffix}`;
    const value = process.env[envKey];
    if (value !== undefined) {
      remoteFields[configKey] = value === 'true' ? true : value === 'false' ? false : value;
      hasRemote = true;
    }
  }
  if (hasRemote) {
    result['remote'] = remoteFields;
  }

  return result;
}

/**
 * Collect GitHub App credentials from GITHUB_APP_* env vars (no SYNC_ENGINE_ prefix).
 * Returns undefined when none of the App vars are set.
 */
function collectGithubAppEnvVars(): Record<string, unknown> | undefined {
  const appId = process.env['GITHUB_APP_ID'];
  const installationId = process.env['GITHUB_APP_INSTALLATION_ID'];
  const privateKey = process.env['GITHUB_APP_PRIVATE_KEY'] ?? null;
  const privateKeyPath = process.env['GITHUB_APP_PRIVATE_KEY_PATH'] ?? null;
  const webhookSecret = process.env['GITHUB_APP_WEBHOOK_SECRET'] ?? null;

  if (!appId && !installationId && !privateKey && !privateKeyPath && !webhookSecret) {
    return undefined;
  }

  return {
    ...(appId !== undefined ? { appId } : {}),
    ...(installationId !== undefined ? { installationId } : {}),
    privateKey,
    privateKeyPath,
    webhookSecret,
  };
}

/**
 * Load, merge, and validate the EngineConfig.
 *
 * Priority (highest → lowest):
 * 1. Explicit `overrides` argument (passed programmatically, e.g. in tests)
 * 2. Environment variables (SYNC_ENGINE_* for most fields; GITHUB_APP_* for App credentials)
 * 3. Config file at `${repoRoot}/.awesome-markdown/sync.config.json`
 * 4. Schema defaults
 *
 * GitHub App credentials are sourced from GITHUB_APP_* env vars (no SYNC_ENGINE_ prefix).
 * Fails fast with a descriptive error on invalid config.
 */
export function loadConfig(overrides: Partial<Record<string, unknown>> = {}): EngineConfig {
  // Determine repoRoot early so we can read the config file
  const repoRootRaw =
    (overrides['repoRoot'] as string | undefined) ??
    process.env[`${ENV_PREFIX}REPO_ROOT`] ??
    process.cwd();

  const fileValues = readConfigFile(repoRootRaw);
  const envValues = collectEnvVars();
  const appEnvValues = collectGithubAppEnvVars();

  // Merge in priority order (overrides > env > file > defaults)
  const merged: Record<string, unknown> = {
    ...fileValues,
    ...envValues,
    ...overrides,
    repoRoot: repoRootRaw,
  };

  // Merge githubApp from env when present and not already supplied via overrides
  if (appEnvValues && !overrides['githubApp']) {
    merged['githubApp'] = appEnvValues;
  }

  const result = EngineConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[sync-engine] Invalid configuration:\n${issues}`);
  }

  const config = result.data;

  // Validate repoRoot existence
  if (!existsSync(config.repoRoot)) {
    throw new Error(
      `[sync-engine] repoRoot does not exist: ${config.repoRoot}`
    );
  }

  // Resolve repoRoot to absolute path
  const resolvedConfig: EngineConfig = {
    ...config,
    repoRoot: path.resolve(config.repoRoot),
  };

  return Object.freeze(resolvedConfig);
}
