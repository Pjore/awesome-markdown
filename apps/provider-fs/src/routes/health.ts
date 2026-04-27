import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const HealthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  contentRoot: z.string(),
});

interface HealthPluginOptions {
  version?: string;
  contentRoot: string;
}

export const healthRoute: FastifyPluginAsync<HealthPluginOptions> = async (
  fastify,
  opts,
) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      ok: true as const,
      version: opts.version ?? '0.1.0',
      contentRoot: opts.contentRoot,
    }),
  );
};
