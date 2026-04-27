import React, { useState, useEffect } from 'react';
import { useProvider } from '../provider/ProviderContext.js';
import { isHttpProvider } from '@awesome-markdown/provider-http';
import type { ConnectionState } from '@awesome-markdown/provider-http';

const STATE_LABELS: Record<ConnectionState, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  online: 'Online',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

const STATE_COLORS: Record<ConnectionState, string> = {
  idle: 'bg-gray-400',
  connecting: 'bg-yellow-400 animate-pulse',
  online: 'bg-green-500',
  reconnecting: 'bg-orange-400 animate-pulse',
  offline: 'bg-red-500',
};

/**
 * Small connection-state pill displayed in the app chrome.
 *
 * - Shows a coloured dot and label reflecting the SSE connection state when
 *   the active provider is an HTTP provider.
 * - Renders "n/a" for the localStorage provider.
 * - Updates within 1 second of a state change via onConnectionStateChange().
 * - Includes an accessible aria-label.
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
        className="text-xs text-gray-400 px-2 py-0.5"
        aria-label="Connection: not applicable (localStorage provider)"
        data-testid="connection-indicator"
        data-connection-state="n/a"
      >
        n/a
      </span>
    );
  }

  const label = STATE_LABELS[state];
  const dotClass = STATE_COLORS[state];

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50"
      aria-label={`Connection: ${label}`}
      title={`SSE: ${label}`}
      data-testid="connection-indicator"
      data-connection-state={state}
    >
      <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}
