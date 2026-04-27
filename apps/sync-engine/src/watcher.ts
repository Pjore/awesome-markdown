import { EventEmitter } from 'node:events';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { RawFsEvent, EngineConfig } from './types.js';

/** Exponential backoff delays (ms) for watcher restart attempts. */
const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

/** Events emitted by FileWatcher. */
export interface FileWatcherEvents {
  change: (event: RawFsEvent) => void;
  error: (err: Error) => void;
  restart: () => void;
  ready: () => void;
}

/**
 * Wraps chokidar to watch the configured `contentDir`.
 * Emits typed `RawFsEvent`s and auto-restarts after errors with capped backoff.
 */
export class FileWatcher extends EventEmitter {
  private inner: FSWatcher | null = null;
  private backoffIndex = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly watchPath: string;

  constructor(private readonly config: EngineConfig) {
    super();
    this.watchPath = path.join(config.repoRoot, config.contentDir);
  }

  /** Start watching. Resolves when chokidar emits 'ready'. */
  start(): Promise<void> {
    this.stopped = false;
    this.backoffIndex = 0;
    return this._startChokidar();
  }

  /** Stop watching and cancel any pending restart timers. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.inner !== null) {
      await this.inner.close();
      this.inner = null;
    }
  }

  /**
   * For testing: inject an error to exercise the error-handling path.
   * Triggers the same recovery flow as a real chokidar error.
   */
  _simulateError(err: Error): void {
    this._handleError(err);
  }

  private _startChokidar(): Promise<void> {
    return new Promise<void>((resolve) => {
      const watcher = chokidar.watch(this.watchPath, {
        ignored: [
          /(^|[/\\])\../,   // dotfiles
          /\.swp$/,          // vim swap
          /~$/,              // editor backup
          /\.tmp$/,          // temp files
        ],
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 80,
          pollInterval: 40,
        },
      });

      this.inner = watcher;

      const emitFs = (event: 'add' | 'change' | 'unlink') => (filePath: string) => {
        const raw: RawFsEvent = {
          event,
          path: filePath,
          timestamp: Date.now(),
        };
        this.emit('change', raw);
      };

      watcher.on('add', emitFs('add'));
      watcher.on('change', emitFs('change'));
      watcher.on('unlink', emitFs('unlink'));
      watcher.on('ready', () => {
        this.backoffIndex = 0;
        this.emit('ready');
        resolve();
      });
      watcher.on('error', (err: unknown) => {
        this._handleError(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private _handleError(err: Error): void {
    this.emit('error', err);
    this._scheduleRestart();
  }

  private _scheduleRestart(): void {
    if (this.stopped) return;

    if (this.inner !== null) {
      void this.inner.close().catch(() => undefined);
      this.inner = null;
    }

    const delayMs =
      BACKOFF_DELAYS_MS[Math.min(this.backoffIndex, BACKOFF_DELAYS_MS.length - 1)] ?? 30000;
    this.backoffIndex++;

    this.restartTimer = setTimeout(() => {
      if (this.stopped) return;
      this.emit('restart');
      void this._startChokidar();
    }, delayMs);
  }
}
