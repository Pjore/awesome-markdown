import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Resolve the OS-appropriate command to open a file with its default app.
 */
function getOpenerCommand(): { cmd: string; useShell: boolean } {
  switch (process.platform) {
    case 'darwin':
      return { cmd: 'open', useShell: false };
    case 'win32':
      return { cmd: 'start', useShell: true };
    default:
      return { cmd: 'xdg-open', useShell: false };
  }
}

/**
 * Launch the OS default handler for the given file path.
 *
 * Security:
 *  - Resolves the path relative to `repoRoot` and rejects anything outside it.
 *  - Rejects path-traversal sequences.
 *
 * The spawned process is detached and its stdio is ignored; this function
 * returns immediately after dispatching the open command.
 *
 * @throws if the path escapes repoRoot or the file does not exist.
 */
export function openExternalFile(repoRoot: string, filePath: string): void {
  // Reject obviously suspicious inputs
  if (path.isAbsolute(filePath)) {
    throw new Error(`Absolute paths are not allowed: ${filePath}`);
  }

  const resolved = path.resolve(repoRoot, filePath);
  const rootWithSep = repoRoot.endsWith(path.sep)
    ? repoRoot
    : repoRoot + path.sep;

  if (!resolved.startsWith(rootWithSep) && resolved !== repoRoot) {
    throw new Error(`Path traversal rejected: "${filePath}" resolves outside repoRoot`);
  }

  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const { cmd, useShell } = getOpenerCommand();

  const args = process.platform === 'win32'
    ? ['/c', 'start', '""', resolved]
    : [resolved];

  const child = spawn(
    process.platform === 'win32' ? 'cmd' : cmd,
    process.platform === 'win32' ? args : [resolved],
    {
      detached: true,
      stdio: 'ignore',
      shell: useShell,
    },
  );
  child.unref();
}
