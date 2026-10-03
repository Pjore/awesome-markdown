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

## Authentication

```typescript
const provider = createHttpProvider({
  baseUrl: 'https://app.example.com/api/v1/w/<workspaceId>',
  // Sent as `Authorization: Bearer <token>` on every HTTP request.
  getToken: async () => accessToken,
  // Optional: SSE-only credential, e.g. a short-lived single-use ticket.
  // Called on every (re)connect. Falls back to `getToken` when omitted.
  getSseToken: async () => (await mintTicket()).ticket,
  // Optional: query parameter for the SSE credential (default `'token'`).
  sseTokenParam: 'ticket',
});
```

`EventSource` cannot send headers, so the SSE credential travels in the query
string (`/subscribe?<sseTokenParam>=<value>`, URL-encoded). Prefer
`getSseToken` with short-lived tickets over putting a long-lived access token
in URLs. If fetching the credential fails, the client retries with the usual
backoff.

## Errors

Non-2xx responses throw `ProviderHttpError` with `status`, the raw `body`, the
server's `error` message, and `code` — the machine-readable
`ErrorResponse.code` when present:

```typescript
import { ErrorCodeSchema } from '@awesome-markdown/contracts';
import { ProviderHttpError } from '@awesome-markdown/provider-http';

try {
  await provider.createItem(req);
} catch (err) {
  if (!(err instanceof ProviderHttpError)) throw err;
  const code = ErrorCodeSchema.safeParse(err.code);
  if (code.success && code.data === 'plan_limit_exceeded') showUpgrade();
}
```

`code` is typed `string | undefined`; servers may send codes newer than this
package's `ErrorCodeSchema`.

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
