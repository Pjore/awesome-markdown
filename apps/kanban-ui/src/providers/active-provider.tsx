import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { PersistenceProvider } from '@awesome-markdown/contracts';
import { isHttpProvider } from '@awesome-markdown/provider-http';
import { ProviderContextProvider } from '../provider/ProviderContext.js';
import type { ProviderSettings } from '../settings/provider-settings.js';
import { saveProviderSettings } from '../settings/storage.js';
import { createProviderFromSettings } from './provider-factory.js';

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

interface ActiveProviderContextValue {
  activeSettings: ProviderSettings;
  isSwitching: boolean;
  rebind: (settings: ProviderSettings) => Promise<void>;
}

const ActiveProviderCtx = createContext<ActiveProviderContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface ActiveProviderProviderProps {
  initialProvider: PersistenceProvider;
  initialSettings: ProviderSettings;
  children: React.ReactNode;
}

/**
 * Manages the active PersistenceProvider lifecycle.
 *
 * - Exposes `rebind(settings)` to swap the provider at runtime.
 * - On rebind: tears down the old provider (stops SSE if HTTP), constructs a
 *   new one, persists the settings, and re-renders the tree with the new provider.
 * - Wraps ProviderContextProvider so that useProvider() consumers (e.g.
 *   useBoardState) automatically see the new provider via React context.
 */
export function ActiveProviderProvider({
  initialProvider,
  initialSettings,
  children,
}: ActiveProviderProviderProps): React.ReactElement {
  const [provider, setProvider] = useState<PersistenceProvider>(initialProvider);
  const [activeSettings, setActiveSettings] = useState<ProviderSettings>(initialSettings);
  const [isSwitching, setIsSwitching] = useState(false);

  // Keep a ref to the current provider for teardown in rebind
  const providerRef = useRef<PersistenceProvider>(initialProvider);
  providerRef.current = provider;

  const rebind = useCallback(async (settings: ProviderSettings): Promise<void> => {
    setIsSwitching(true);
    try {
      // Tear down the current provider if it is an HTTP provider
      const old = providerRef.current;
      if (isHttpProvider(old)) {
        old.stop();
      }

      const newProvider = createProviderFromSettings(settings);
      saveProviderSettings(settings);
      providerRef.current = newProvider;
      setProvider(newProvider);
      setActiveSettings(settings);
    } finally {
      setIsSwitching(false);
    }
  }, []);

  const ctxValue: ActiveProviderContextValue = { activeSettings, isSwitching, rebind };

  return (
    <ActiveProviderCtx.Provider value={ctxValue}>
      <ProviderContextProvider provider={provider}>
        {children}
      </ProviderContextProvider>
    </ActiveProviderCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns active provider context: settings, switching state, and rebind fn.
 * Must be called inside <ActiveProviderProvider>.
 */
export function useActiveProvider(): ActiveProviderContextValue {
  const ctx = useContext(ActiveProviderCtx);
  if (ctx === null) {
    throw new Error('useActiveProvider must be used inside ActiveProviderProvider');
  }
  return ctx;
}
