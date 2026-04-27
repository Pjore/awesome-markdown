/**
 * Typed errors thrown by repository modules.
 * HTTP route handlers map these to appropriate status codes.
 */

export type RepoErrorCode =
  | 'not_found'
  | 'already_exists'
  | 'validation_failed'
  | 'io_error';

export class RepoError extends Error {
  readonly code: RepoErrorCode;

  constructor(code: RepoErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RepoError';
    this.code = code;
  }
}

export function isENOENT(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
