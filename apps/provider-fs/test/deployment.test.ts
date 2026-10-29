import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseSafeYaml } from '@awesome-markdown/contracts';
import { createServer } from '../src/server.js';
import { tmpContentRoot } from './fixtures/temp-content.js';

describe('coordinated production release', () => {
  it('builds the API and UI from the same checkout instead of mixing source and latest images', async () => {
    const source = await readFile(
      new URL('../../../docker-compose.dokploy.yml', import.meta.url),
      'utf8'
    );
    const services = parseSafeYaml(source).services as Record<string, Record<string, unknown>>;
    expect(services['provider-fs']?.build).toEqual({
      context: '.',
      dockerfile: 'apps/provider-fs/Dockerfile',
    });
    expect(services['provider-fs']).not.toHaveProperty('image');
    expect(services['kanban-ui']?.build).toMatchObject({
      context: '.',
      dockerfile: 'apps/kanban-ui/Dockerfile',
    });
    expect(services['provider-fs']?.labels).toContain(
      'traefik.http.routers.compose-input-primary-program-r9pfq2-31-websecure.middlewares=forward-auth-errors@file,forward-auth@file'
    );
  });
  it('builds core before its localStorage consumer in the UI container', async () => {
    const source = await readFile(new URL('../../kanban-ui/Dockerfile', import.meta.url), 'utf8');
    const core = source.indexOf('RUN pnpm --filter @awesome-markdown/core build');
    const consumer = source.indexOf('RUN pnpm --filter @awesome-markdown/provider-localstorage build');
    expect(core).toBeGreaterThan(-1);
    expect(core).toBeLessThan(consumer);
  });
  it('advertises the installed provider version and revisioned item protocol', async () => {
    const tmp = await tmpContentRoot();
    const server = await createServer({ port: 0, host: '127.0.0.1', contentRoot: tmp.contentRoot });
    try {
      const response = await server.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, version: '2.0.2', itemProtocol: 2 });
    } finally {
      await server.close();
      await tmp.cleanup();
    }
  });
});
