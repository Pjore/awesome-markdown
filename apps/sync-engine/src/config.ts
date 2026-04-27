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
 * Load, merge, and validate the EngineConfig.
 *
 * Priority (highest → lowest):
 * 1. Explicit `overrides` argument (passed programmatically, e.g. in tests)
 * 2. Environment variables (SYNC_ENGINE_*)
 * 3. Config file at `${repoRoot}/.awesome-markdown/sync.config.json`
 * 4. Schema defaults
 *
 * Fails fast with a descriptive error on invalid config.
 *
 * GITHUB_TOKEN is read from process.env directly and attached separately —
 * it is never included in the serialised config object.
 */
export function loadConfig(overrides: Partial<Record<string, unknown>> = {}): EngineConfig {
  // Determine repoRoot early so we can read the config file
  const repoRootRaw =
    (overrides['repoRoot'] as string | undefined) ??
    process.env[`${ENV_PREFIX}REPO_ROOT`] ??
    process.cwd();

  const fileValues = readConfigFile(repoRootRaw);
  const envValues = collectEnvVars();

  // Merge in priority order (overrides > env > file > defaults)
  const merged: Record<string, unknown> = {
    ...fileValues,
    ...envValues,
    ...overrides,
    repoRoot: repoRootRaw,
  };

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

  // Read GITHUB_TOKEN from env exclusively — never from config file or overrides
  const githubToken = process.env['GITHUB_TOKEN'] ?? undefined;

  // Resolve repoRoot to absolute path
  const resolvedConfig: EngineConfig = {
    ...config,
    repoRoot: path.resolve(config.repoRoot),
    ...(githubToken ? { githubToken } : {}),
  };

  return Object.freeze(resolvedConfig);
}
