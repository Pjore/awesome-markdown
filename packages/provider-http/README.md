# @awesome-markdown/provider-http

HTTP/SSE implementation of `PersistenceProvider` for the awesome-markdown kanban UI.

This package connects to the M4 `provider-fs` sidecar over HTTP for CRUD operations
and subscribes to its SSE stream for live updates.

## Features

- Full `PersistenceProvider` implementation via HTTP CRUD against the sidecar
- SSE subscriber with exponential backoff + jitter reconnection
- Observable `ConnectionState` (`idle | connecting | online | reconnecting | offline`)
- Injectable `fetch` and `EventSource` constructors for testability

## Usage

```typescript
import { createHttpProvider } from '@awesome-markdown/provider-http';

const provider = createHttpProvider({ baseUrl: 'http://localhost:3000' });
```

## Connection State

The HTTP provider exposes connection-state methods beyond the base interface:

```typescript
import { isHttpProvider } from '@awesome-markdown/provider-http';

if (isHttpProvider(provider)) {
  provider.onConnectionStateChange((state) => {
    console.log('SSE state:', state);
  });
}
```

## Reconnect Behaviour

- Base delay: 500 ms
- Doubles on each failure (exponential backoff)
- Maximum delay: 30 s
- ±25% jitter applied to each delay
- Resets retry count on successful `open`
- Stops permanently on `provider.stop()`
