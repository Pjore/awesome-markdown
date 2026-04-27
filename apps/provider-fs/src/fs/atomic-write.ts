import { writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Write `contents` to `filePath` atomically using a temp-then-rename strategy.
 * Parent directories are created automatically if missing.
 * On failure the temp file is cleaned up and the original (if any) is preserved.
 */
export async function writeFileAtomic(
  filePath: string,
  contents: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(tmpPath, contents, 'utf-8');
    await rename(tmpPath, filePath);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}
