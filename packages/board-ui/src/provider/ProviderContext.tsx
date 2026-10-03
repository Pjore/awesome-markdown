import React, { createContext, useContext } from 'react';
import type { PersistenceProvider } from '@awesome-markdown/contracts';

const ProviderContext = createContext<PersistenceProvider | null>(null);

interface ProviderContextProviderProps {
  provider: PersistenceProvider;
  children: React.ReactNode;
}

/**
 * Injects a PersistenceProvider instance into the React tree.
 * Wrap your root component with this to enable useProvider().
 */
export function ProviderContextProvider({
  provider,
  children,
}: ProviderContextProviderProps): React.ReactElement {
  return (
    <ProviderContext.Provider value={provider}>
      {children}
    </ProviderContext.Provider>
  );
}

/**
 * Returns the bound PersistenceProvider. Throws if used outside ProviderContextProvider.
 */
export function useProvider(): PersistenceProvider {
  const ctx = useContext(ProviderContext);
  if (ctx === null) {
    throw new Error('useProvider must be used inside a ProviderContextProvider');
  }
  return ctx;
}
