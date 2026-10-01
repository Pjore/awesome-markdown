import React, { useState, useEffect } from 'react';
import { useProvider } from '../provider/ProviderContext.js';
import { isHttpProvider } from '@awesome-markdown/provider-http';
import type { ConnectionState } from '@awesome-markdown/provider-http';

/**
 * Maps HTTP connection state to the three sync visual states:
 * - clean (idle/online)  → static --ink-muted dot
 * - pulling (connecting/reconnecting) → pulsing --ink dot
 * - dirty (offline)      → solid --ink dot
 */
function stateToSync(s: ConnectionState): 'clean' | 'pulling' | 'dirty' {
  if (s === 'connecting' || s === 'reconnecting') return 'pulling';
  if (s === 'offline') return 'dirty';
  return 'clean';
}

const SYNC_COLORS: Record<'clean' | 'pulling' | 'dirty', string> = {
  clean: 'var(--ink-muted)',
  pulling: 'var(--ink)',
  dirty: 'var(--ink)',
};

const SYNC_LABELS: Record<'clean' | 'pulling' | 'dirty', string> = {
  clean: 'Sync clean',
  pulling: 'Syncing…',
  dirty: 'Sync dirty — changes pending',
};

/**
 * 6 px sync-status circle.
 * No chromatic colors — grayscale tokens only per design spec.
 * pulling state: pulsing animation.
 */
export function SyncStatusDot(): React.ReactElement {
  const provider = useProvider();
  const isHttp = isHttpProvider(provider);

  const [state, setState] = useState<ConnectionState | null>(
    isHttp ? provider.getConnectionState() : null,
  );

  useEffect(() => {
    if (!isHttpProvider(provider)) {
      setState(null);
      return;
    }
    setState(provider.getConnectionState());
    const unsub = provider.onConnectionStateChange((s) => setState(s));
    return unsub;
  }, [provider]);

  const syncState = state !== null ? stateToSync(state) : 'clean';
  const isPulsing = syncState === 'pulling';

  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: SYNC_COLORS[syncState],
        flexShrink: 0,
        animation: isPulsing ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
      aria-label={SYNC_LABELS[syncState]}
      title={SYNC_LABELS[syncState]}
      data-testid="sync-status-dot"
      data-sync-state={syncState}
      data-connection-state={state ?? 'n/a'}
    />
  );
}
