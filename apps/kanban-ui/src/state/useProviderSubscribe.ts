import { useEffect, useRef } from 'react';
import type { ProviderEvent } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';

type ChangeCallback = (event: ProviderEvent | null) => void;

/**
 * Subscribes to all provider change signals and invokes `callback` on each,
 * debounced by `debounceMs` (default 100 ms).
 *
 * Two signal sources are wired:
 * - `provider.subscribe()` — fires when the http/localstorage provider detects
 *   a mutation (local API write or provider-fs file-watcher). The `ProviderEvent`
 *   payload is forwarded to the callback.
 * - `window` `sync-engine:change` custom event — fired by `conflict-store` when
 *   the sync-engine SSE (port 7402) broadcasts a change (e.g. after a git pull).
 *   The callback receives `null` because this path carries no entity metadata.
 *
 * The callback is stabilised via `useRef` so callers do not need to memoize it —
 * the latest closure is always called without re-registering subscriptions.
 *
 * Subscriptions are re-established when `provider` or `debounceMs` change.
 */
export function useProviderSubscribe(
  callback: ChangeCallback,
  debounceMs = 100,
): void {
  const provider = useProvider();

  // Always holds the latest callback without causing effect re-runs.
  const callbackRef = useRef<ChangeCallback>(callback);
  callbackRef.current = callback;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const schedule = (event: ProviderEvent | null): void => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        callbackRef.current(event);
      }, debounceMs);
    };

    const unsubscribe = provider.subscribe((event) => schedule(event));

    const handleWindowChange = (): void => schedule(null);
    window.addEventListener('sync-engine:change', handleWindowChange);

    return () => {
      unsubscribe();
      window.removeEventListener('sync-engine:change', handleWindowChange);
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [provider, debounceMs]);
}
