import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createTempRepo } from './helpers/tempRepo.js';

// We import the raw loadConfig so we can test it without actually starting a server.
import { loadConfig } from '../src/config.js';

describe('configuration loader', () => {
  it('throws with a descriptive error when repoRoot is missing', () => {
    const nonExistent = path.join(os.tmpdir(), 'no-such-dir-sync-engine-test');
    expect(() =>
      loadConfig({ repoRoot: nonExistent }),
    ).toThrow(/repoRoot does not exist/);
  });

  it('throws with a descriptive error when debounceMs is below the minimum', async () => {
    const repo = await createTempRepo();
    try {
      expect(() =>
        loadConfig({ repoRoot: repo.repoRoot, debounceMs: 10 }),
      ).toThrow(/Invalid configuration/);
    } finally {
      await repo.cleanup();
    }
  });

  it('throws when port is out of range', async () => {
    const repo = await createTempRepo();
    try {
      expect(() =>
        loadConfig({ repoRoot: repo.repoRoot, port: 99999 }),
      ).toThrow(/Invalid configuration/);
    } finally {
      await repo.cleanup();
    }
  });

  it('accepts valid configuration and returns a frozen object', async () => {
    const repo = await createTempRepo();
    try {
      const config = loadConfig({
        repoRoot: repo.repoRoot,
        debounceMs: 200,
        port: 7402,
        host: '127.0.0.1',
      });
      expect(config.repoRoot).toBe(path.resolve(repo.repoRoot));
      expect(config.contentDir).toBe('content');
      expect(config.debounceMs).toBe(200);
      expect(config.port).toBe(7402);
      expect(Object.isFrozen(config)).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });

  it('applies schema defaults when only repoRoot is provided', async () => {
    const repo = await createTempRepo();
    try {
      const config = loadConfig({ repoRoot: repo.repoRoot });
      expect(config.debounceMs).toBe(750);
      expect(config.port).toBe(7402);
      expect(config.host).toBe('127.0.0.1');
      expect(config.contentDir).toBe('content');
      expect(config.commitAuthorName).toBe('awesome-markdown-sync');
      expect(config.commitAuthorEmail).toBe('sync@local');
    } finally {
      await repo.cleanup();
    }
  });

  it('reads from a config file when present', async () => {
    const repo = await createTempRepo();
    try {
      const configDir = path.join(repo.repoRoot, '.awesome-markdown');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, 'sync.config.json'),
        JSON.stringify({ debounceMs: 400, port: 7403 }),
        'utf8',
      );

      const config = loadConfig({ repoRoot: repo.repoRoot });
      expect(config.debounceMs).toBe(400);
      expect(config.port).toBe(7403);
    } finally {
      await repo.cleanup();
    }
  });

  it('env vars override config file values', async () => {
    const repo = await createTempRepo();
    const origEnv = process.env['SYNC_ENGINE_PORT'];
    try {
      const configDir = path.join(repo.repoRoot, '.awesome-markdown');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, 'sync.config.json'),
        JSON.stringify({ port: 7403 }),
        'utf8',
      );

      process.env['SYNC_ENGINE_PORT'] = '7410';
      const config = loadConfig({ repoRoot: repo.repoRoot });
      expect(config.port).toBe(7410);
    } finally {
      if (origEnv === undefined) {
        delete process.env['SYNC_ENGINE_PORT'];
      } else {
        process.env['SYNC_ENGINE_PORT'] = origEnv;
      }
      await repo.cleanup();
    }
  });

  it('reads GITHUB_APP_* env vars into config.githubApp', async () => {
    const repo = await createTempRepo();
    const origId = process.env['GITHUB_APP_ID'];
    const origInstId = process.env['GITHUB_APP_INSTALLATION_ID'];
    const origKey = process.env['GITHUB_APP_PRIVATE_KEY'];
    try {
      process.env['GITHUB_APP_ID'] = '12345';
      process.env['GITHUB_APP_INSTALLATION_ID'] = '67890';
      process.env['GITHUB_APP_PRIVATE_KEY'] = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';

      const config = loadConfig({ repoRoot: repo.repoRoot });
      expect(config.githubApp).toBeDefined();
      expect(config.githubApp?.appId).toBe('12345');
      expect(config.githubApp?.installationId).toBe('67890');
      expect(config.githubApp?.privateKey).toBeTruthy();
      expect(config.githubApp?.privateKeyPath).toBeNull();
      // Verify githubToken is not on config
      expect((config as Record<string, unknown>)['githubToken']).toBeUndefined();
    } finally {
      if (origId === undefined) delete process.env['GITHUB_APP_ID'];
      else process.env['GITHUB_APP_ID'] = origId;
      if (origInstId === undefined) delete process.env['GITHUB_APP_INSTALLATION_ID'];
      else process.env['GITHUB_APP_INSTALLATION_ID'] = origInstId;
      if (origKey === undefined) delete process.env['GITHUB_APP_PRIVATE_KEY'];
      else process.env['GITHUB_APP_PRIVATE_KEY'] = origKey;
      await repo.cleanup();
    }
  });

  it('config.githubApp is absent when no GITHUB_APP_* vars are set', async () => {
    const repo = await createTempRepo();
    // Ensure none of the App vars are set in the test environment
    const saved = ['GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_PRIVATE_KEY_PATH'].map((k) => [k, process.env[k]] as const);
    for (const [k] of saved) delete process.env[k];
    try {
      const config = loadConfig({ repoRoot: repo.repoRoot });
      expect(config.githubApp).toBeUndefined();
    } finally {
      for (const [k, v] of saved) if (v !== undefined) process.env[k] = v;
      await repo.cleanup();
    }
  });
});
