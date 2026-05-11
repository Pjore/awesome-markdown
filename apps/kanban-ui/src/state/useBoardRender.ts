import { useState, useEffect, useCallback, useRef } from 'react';
import type { BoardRender, Homeless } from '@awesome-markdown/contracts';
import { useProvider } from '../provider/ProviderContext.js';
import { useProviderSubscribe } from './useProviderSubscribe.js';

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
 * Coalesces rapid SSE change events into a single re-fetch per board
 * via `useProviderSubscribe` (debounce ~100 ms).
 */
export function useBoardRender(slug: string): BoardRenderState {
  const provider = useProvider();
  const [render, setRender] = useState<BoardRender | null>(null);
  const [homeless, setHomeless] = useState<Homeless | null>(null);
  const [status, setStatus] = useState<BoardRenderStatus>('loading');

  const slugRef = useRef(slug);
  slugRef.current = slug;

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

  useEffect(() => {
    setRender(null);
    setHomeless(null);
    setStatus('loading');
    void fetchAll();
  }, [provider, slug, fetchAll]);

  useProviderSubscribe(() => void fetchAll());

  return { status, render, homeless, refetch: fetchAll };
}
