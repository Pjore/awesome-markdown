/**
 * ProviderHttpError.code — populated from ErrorResponse.code.
 * Additive tests; existing http-client tests are not modified.
 */
import { describe, it, expect, vi } from 'vitest';
import { ErrorCodeSchema } from '@awesome-markdown/contracts';
import { SidecarHttpClient, ProviderHttpError } from '../src/http-client.js';

function clientReturning(status: number, body: unknown, raw = false): SidecarHttpClient {
  const fetchFn = vi.fn(async () =>
    new Response(raw ? (body as string) : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return new SidecarHttpClient({ baseUrl: 'http://localhost:7701', fetchFn: fetchFn as typeof fetch });
}

async function errorFrom(p: Promise<unknown>): Promise<ProviderHttpError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderHttpError);
    return err as ProviderHttpError;
  }
  throw new Error('expected rejection');
}

describe('ProviderHttpError.code', () => {
  it('carries ErrorResponse.code from the body', async () => {
    const body = { error: 'limit reached', code: 'plan_limit_exceeded', feature: 'items', limit: 500 };
    const err = await errorFrom(clientReturning(402, body).createItem({ slug: 'x', title: 'X', mutations: [] }));
    expect(err.status).toBe(402);
    expect(err.message).toBe('limit reached');
    expect(err.code).toBe('plan_limit_exceeded');
    expect(err.body).toEqual(body);
    expect(ErrorCodeSchema.safeParse(err.code).success).toBe(true);
  });

  it('passes through codes unknown to ErrorCodeSchema', async () => {
    const err = await errorFrom(clientReturning(409, { error: 'nope', code: 'future_code' }).listBoards());
    expect(err.code).toBe('future_code');
  });

  it('is undefined when the body has no code', async () => {
    const err = await errorFrom(clientReturning(500, { error: 'internal error' }).listBoards());
    expect(err.message).toBe('internal error');
    expect(err.code).toBeUndefined();
  });

  it('is undefined when the body is not an ErrorResponse', async () => {
    const err = await errorFrom(clientReturning(502, '<html>bad gateway</html>', true).listAxes());
    expect(err.message).toBe('HTTP 502');
    expect(err.code).toBeUndefined();
  });

  it('is populated on health() failures too', async () => {
    const err = await errorFrom(clientReturning(403, { error: 'no', code: 'forbidden' }).health());
    expect(err.code).toBe('forbidden');
  });

  it('getX() still maps 404 to null regardless of code', async () => {
    await expect(clientReturning(404, { error: 'gone', code: 'not_found' }).getItem('x')).resolves.toBeNull();
  });

  it('can still be constructed with the original three arguments', () => {
    const err = new ProviderHttpError(500, null, 'boom');
    expect(err.code).toBeUndefined();
    expect(err.name).toBe('ProviderHttpError');
  });
});
