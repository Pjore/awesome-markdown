/**
 * Provider capabilities and event types — stub for M1.
 *
 * The full PersistenceProvider interface (CRUD + render + homeless
 * operations using the new entity model) will be defined in M3.
 * Downstream consumers (provider-fs, provider-localstorage, provider-http)
 * will be updated in subsequent milestones.
 */

// ---------------------------------------------------------------------------
// Provider capabilities discriminator
// ---------------------------------------------------------------------------

export type ProviderCapabilities = { type: 'local' } | { type: 'http'; baseUrl: string };

// ---------------------------------------------------------------------------
// Provider subscription events
// ---------------------------------------------------------------------------

export type ProviderEvent =
  | { type: 'change'; entitySlug: string; entityType: 'item' | 'board' | 'axis' }
  | { type: 'synced' }
  | { type: 'offline'; reason?: string };

export type ProviderEventHandler = (event: ProviderEvent) => void;

/** Calling the returned function cancels the subscription. */
export type Unsubscribe = () => void;
