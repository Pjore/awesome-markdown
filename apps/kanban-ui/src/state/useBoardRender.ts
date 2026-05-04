import { useState, useEffect, useCallback, useRef } from 'react';
import type { BoardRender, Homeless } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';

export type BoardRenderStatus = 'loading' | 'ready' | 'error';

export interface BoardRenderState {
  status: BoardRenderStatus;
  render: BoardRender | null;
  homeless: Homeless | null;
  refetch: () => void;
}

/**
 * Fetches the render envelope and homeless list for a board by slug.
 *
 * Coalesces rapid SSE `content-changed` events into a single re-fetch
 * per board (debounce ~100 ms).
 */
export function useBoardRender(slug: string): BoardRenderState {
  const provider = useProvider();
  const [render, setRender] = useState<BoardRender | null>(null);
  const [homeless, setHomeless] = useState<Homeless | null>(null);
  const [status, setStatus] = useState<BoardRenderStatus>('loading');

  const slugRef = useRef(slug);
  slugRef.current = slug;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async (): Promise<void> => {
    const currentSlug = slugRef.current;
    try {
      const [renderResult, homelessResult] = await Promise.all([
        provider.getBoardRender(currentSlug),
        provider.getHomeless(currentSlug),
      ]);
      // Discard if slug changed while inflight
      if (slugRef.current !== currentSlug) return;
      setRender(renderResult);
      setHomeless(homelessResult);
      setStatus('ready');
    } catch (err) {
      console.error('Failed to load board render', currentSlug, err);
      if (slugRef.current === currentSlug) {
        setStatus('error');
      }
    }
  }, [provider]);

  const scheduleFetch = useCallback((): void => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchAll();
    }, 100);
  }, [fetchAll]);

  useEffect(() => {
    setRender(null);
    setHomeless(null);
    setStatus('loading');
    void fetchAll();

    const unsubscribe = provider.subscribe((_event) => {
      scheduleFetch();
    });

    const handleRemoteChange = (): void => {
      scheduleFetch();
    };
    window.addEventListener('sync-engine:change', handleRemoteChange);

    return () => {
      unsubscribe();
      window.removeEventListener('sync-engine:change', handleRemoteChange);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [provider, slug, fetchAll, scheduleFetch]);

  return { status, render, homeless, refetch: fetchAll };
}
