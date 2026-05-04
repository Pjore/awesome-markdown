import React, { useState, useEffect } from 'react';
import { useProvider } from '../provider/ProviderContext.js';
import { isHttpProvider } from '@awesome-markdown/provider-http';
import type { ConnectionState } from '@awesome-markdown/provider-http';

const STATE_COLORS: Record<ConnectionState, string> = {
  idle: 'var(--ink-muted)',
  connecting: 'var(--accent)',
  online: '#4CAF50',
  reconnecting: 'var(--accent)',
  offline: '#E53E3E',
};

const STATE_LABELS: Record<ConnectionState, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  online: 'Online',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

/**
 * 6px connection-state circle displayed in the app chrome.
 * No text label, no border, no bg pill.
 * connecting/reconnecting: animated pulse using CSS animation.
 */
export function ConnectionIndicator(): React.ReactElement {
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

  if (!isHttp || state === null) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--ink-muted)',
          flexShrink: 0,
        }}
        aria-label="Connection: not applicable (localStorage provider)"
        data-testid="connection-indicator"
        data-connection-state="n/a"
      />
    );
  }

  const isPulsing = state === 'connecting' || state === 'reconnecting';

  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: STATE_COLORS[state],
        flexShrink: 0,
        animation: isPulsing ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
      aria-label={`Connection: ${STATE_LABELS[state]}`}
      title={`SSE: ${STATE_LABELS[state]}`}
      data-testid="connection-indicator"
      data-connection-state={state}
    />
  );
}

