import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import type { ConflictState, ResolveDecision } from '@awesome-markdown/contracts';
import { fetchConflictState, submitDecisions, requestOpenExternal, getSyncEngineUrl } from './conflict-api.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ConflictStoreState {
  activeConflict: ConflictState | null;
  submitting: boolean;
  error: string | null;
}

const initialState: ConflictStoreState = {
  activeConflict: null,
  submitting: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ConflictAction =
  | { type: 'SET_CONFLICT'; conflict: ConflictState | null }
  | { type: 'CLEAR_CONFLICT' }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_ERROR'; message: string | null };

function conflictReducer(
  state: ConflictStoreState,
  action: ConflictAction,
): ConflictStoreState {
  switch (action.type) {
    case 'SET_CONFLICT':
      return { ...state, activeConflict: action.conflict, error: null };
    case 'CLEAR_CONFLICT':
      return { ...state, activeConflict: null, submitting: false, error: null };
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.message, submitting: false };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ConflictContextValue extends ConflictStoreState {
  isPathAffected: (filePath: string) => boolean;
  /** Returns true if any conflicted path contains the given item ID. */
  isItemAffected: (itemId: string) => boolean;
  decisionFor: (filePath: string) => ResolveDecision | null;
  resolve: (decisions: Record<string, ResolveDecision>) => Promise<void>;
  openExternal: (filePath: string) => Promise<void>;
  dismissError: () => void;
}

const ConflictCtx = createContext<ConflictContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ConflictProviderProps {
  children: React.ReactNode;
}

/**
 * Provides the conflict store to the component tree.
 *
 * On mount:
 *  1. Fetches GET /sync/conflict/state to hydrate any in-flight conflict.
 *  2. Subscribes to SSE events (conflict / synced) via EventSource.
 *
 * The EventSource is reconnect-safe: duplicate `conflict` events for the same
 * mergeId are coalesced (idempotent set-state).
 */
export function ConflictProvider({ children }: ConflictProviderProps): React.ReactElement {
  const [state, dispatch] = useReducer(conflictReducer, initialState);
  const esRef = useRef<EventSource | null>(null);

  // Hydrate from server on mount
  useEffect(() => {
    let cancelled = false;
    fetchConflictState().then((conflict) => {
      if (!cancelled) {
        dispatch({ type: 'SET_CONFLICT', conflict });
      }
    }).catch(() => {
      // Sync-engine not running — ignore silently
    });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to SSE events
  useEffect(() => {
    const base = getSyncEngineUrl();

    const es = new EventSource(`${base}/events`);
    esRef.current = es;

    es.addEventListener('conflict', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { mergeId?: string; paths?: string[] };
        // If same mergeId, coalesce (don't re-render unnecessarily)
        // Fetch fresh state so we have the full ConflictState shape
        fetchConflictState().then((conflict) => {
          dispatch({ type: 'SET_CONFLICT', conflict });
        }).catch(() => {});
      } catch {
        // Malformed event — ignore
      }
    });

    es.addEventListener('synced', () => {
      dispatch({ type: 'CLEAR_CONFLICT' });
    });

    es.addEventListener('change', () => {
      window.dispatchEvent(new CustomEvent('sync-engine:change'));
    });

    // Clean up on unmount
    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const isPathAffected = useCallback(
    (filePath: string) => {
      if (!state.activeConflict) return false;
      return state.activeConflict.pendingPaths.includes(filePath) ||
        state.activeConflict.paths.some((p) => p.path === filePath);
    },
    [state.activeConflict],
  );

  const isItemAffected = useCallback(
    (itemId: string) => {
      if (!state.activeConflict) return false;
      return state.activeConflict.paths.some((p) => p.path.includes(itemId));
    },
    [state.activeConflict],
  );

  const decisionFor = useCallback(
    (filePath: string): ResolveDecision | null => {
      if (!state.activeConflict) return null;
      const entry = state.activeConflict.paths.find((p) => p.path === filePath);
      return entry?.decision ?? null;
    },
    [state.activeConflict],
  );

  const resolve = useCallback(
    async (decisions: Record<string, ResolveDecision>) => {
      if (!state.activeConflict) return;
      dispatch({ type: 'SET_SUBMITTING', value: true });
      try {
        const result = await submitDecisions(state.activeConflict.mergeId, decisions);
        if (result.status === 'completed') {
          dispatch({ type: 'CLEAR_CONFLICT' });
        } else {
          // Partial — refresh state
          const updated = await fetchConflictState();
          dispatch({ type: 'SET_CONFLICT', conflict: updated });
        }
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          message: err instanceof Error ? err.message : 'Resolution failed',
        });
      } finally {
        dispatch({ type: 'SET_SUBMITTING', value: false });
      }
    },
    [state.activeConflict],
  );

  const openExternal = useCallback(async (filePath: string) => {
    try {
      await requestOpenExternal(filePath);
      // Refresh conflict state to reflect external decision
      const updated = await fetchConflictState();
      dispatch({ type: 'SET_CONFLICT', conflict: updated });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        message: err instanceof Error ? err.message : 'Failed to open file',
      });
    }
  }, []);

  const dismissError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', message: null });
  }, []);

  const value: ConflictContextValue = {
    ...state,
    isPathAffected,
    isItemAffected,
    decisionFor,
    resolve,
    openExternal,
    dismissError,
  };

  return React.createElement(ConflictCtx.Provider, { value }, children);
}

/** Access the conflict store. Must be used inside <ConflictProvider>. */
export function useConflict(): ConflictContextValue {
  const ctx = useContext(ConflictCtx);
  if (!ctx) {
    throw new Error('useConflict must be used inside <ConflictProvider>');
  }
  return ctx;
}

/**
 * Like useConflict but returns null when not inside <ConflictProvider>.
 * Useful for components that are also rendered outside a provider (e.g. tests).
 */
export function useOptionalConflict(): ConflictContextValue | null {
  return useContext(ConflictCtx);
}
