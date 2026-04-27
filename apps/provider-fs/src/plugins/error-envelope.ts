import type { FastifyInstance } from 'fastify';
import { RepoError } from '../errors.js';

/**
 * Install a Fastify error handler that maps RepoError and Zod validation
 * errors to the contracts uniform error envelope.
 *
 * Error envelope shape: { error: string, code?: string }
 *
 * Must be called on the root Fastify instance (not inside a plugin)
 * so that it applies to all encapsulation scopes.
 */
export function installErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((err, _request, reply) => {
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof RepoError) {
      const status = repoErrorToStatus(err.code);
      return reply.status(status).send({ error: message, code: err.code });
    }

    // Fastify validation errors (from fastify-type-provider-zod)
    if ((err as { validation?: unknown }).validation !== undefined) {
      return reply.status(400).send({
        error: message,
        code: 'validation_failed',
      });
    }

    // Errors with an explicit statusCode (e.g. from @fastify/sensible)
    const statusCode =
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;

    if (statusCode >= 400 && statusCode < 500) {
      return reply
        .status(statusCode)
        .send({ error: message, code: 'client_error' });
    }

    // Mask internal errors — do not leak stack traces
    return reply.status(500).send({ error: 'Internal server error', code: 'io_error' });
  });
}

function repoErrorToStatus(code: RepoError['code']): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'already_exists':
      return 409;
    case 'validation_failed':
      return 422;
    case 'io_error':
      return 500;
  }
}
