import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface TempContentRoot {
  contentRoot: string;
  cleanup: () => Promise<void>;
}

/**
 * Allocate a per-test content root under the OS temp dir.
 * Returns the path and a cleanup function to delete it.
 */
export async function tmpContentRoot(): Promise<TempContentRoot> {
  const contentRoot = path.join(
    os.tmpdir(),
    `provider-fs-test-${crypto.randomUUID()}`,
  );
  await mkdir(contentRoot, { recursive: true });

  return {
    contentRoot,
    cleanup: async () => {
      await rm(contentRoot, { recursive: true, force: true });
    },
  };
}
