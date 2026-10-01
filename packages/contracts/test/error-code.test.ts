import { describe, it, expect, expectTypeOf } from 'vitest';
import { ErrorCodeSchema, ErrorResponseSchema } from '../src/index.js';
import type { ErrorCode, ErrorResponse } from '../src/index.js';

describe('ErrorCodeSchema', () => {
  it('lists the known error codes', () => {
    expect(ErrorCodeSchema.options).toEqual([
      'not_found',
      'already_exists',
      'validation_failed',
      'forbidden',
      'unauthorized',
      'email_unverified',
      'plan_limit_exceeded',
      'rate_limited',
      'invite_email_mismatch',
      'invite_expired',
      'sole_owner',
      'client_error',
      'io_error',
    ]);
  });

  it('covers every code provider-fs emits', () => {
    for (const code of ['not_found', 'already_exists', 'validation_failed', 'client_error', 'io_error']) {
      expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects unknown codes', () => {
    expect(ErrorCodeSchema.safeParse('teapot').success).toBe(false);
  });
});

describe('ErrorResponseSchema (compatibility)', () => {
  it('still accepts codes outside ErrorCodeSchema', () => {
    expect(ErrorResponseSchema.safeParse({ error: 'x', code: 'future_code' }).success).toBe(true);
  });

  it('still accepts a missing code', () => {
    expect(ErrorResponseSchema.safeParse({ error: 'x' }).success).toBe(true);
  });

  it('keeps code typed as an optional string', () => {
    expectTypeOf<ErrorResponse['code']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ErrorCode>().toExtend<string>();
  });
});
