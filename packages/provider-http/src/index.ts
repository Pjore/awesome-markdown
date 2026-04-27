// Connection state types
export type { ConnectionState, ConnectionStateHandler } from './connection-state.js';

// HTTP client (exported for testing / advanced usage)
export { SidecarHttpClient, ProviderHttpError } from './http-client.js';
export type { HttpClientConfig, FetchFn } from './http-client.js';

// SSE client (exported for testing / advanced usage)
export { SseClient } from './sse-client.js';
export type { SseClientConfig, EventSourceCtor } from './sse-client.js';

// Provider factory and type guard
export { createHttpProvider, isHttpProvider } from './provider.js';
export type { HttpPersistenceProvider, HttpProviderConfig } from './provider.js';
