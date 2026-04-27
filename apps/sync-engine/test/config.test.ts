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
});
