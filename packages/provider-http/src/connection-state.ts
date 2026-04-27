/**
 * Observable states for the SSE client connection lifecycle.
 *
 * Transitions:
 *   idle        → connecting   (on start())
 *   connecting  → online       (EventSource fires 'open')
 *   online      → reconnecting (EventSource fires 'error', retry scheduled)
 *   reconnecting → online      (reconnect succeeds)
 *   any         → offline      (stop() called)
 */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline';

export type ConnectionStateHandler = (state: ConnectionState) => void;
