# @awesome-markdown/board-ui

The awesome-markdown board surface — board list, kanban board with filter-derived
drag-and-drop, homeless panel, inline layout editing, item editor and sync-engine
conflict resolution — as a router-agnostic React 19 library.

`apps/kanban-ui` is a thin shell around this package; other hosts (for example a
multi-tenant cloud app) mount the same pages under their own router and provider.

## Install

```bash
pnpm add @awesome-markdown/board-ui react react-dom
```

## Usage

```tsx
import '@awesome-markdown/board-ui/styles.css';
import {
  BoardListPage,
  BoardPage,
  ItemEditorPage,
  ProviderContextProvider,
  RouterAdapterProvider,
  type RouterAdapter,
} from '@awesome-markdown/board-ui';

const adapter: RouterAdapter = {
  Link: ({ to, ...props }) => <MyLink to={`/w/acme${to}`} {...props} />,
  navigate: (to) => router.navigate(`/w/acme${to}`),
  useParams: () => useMyRouterParams(),
  useSearchParams: () => new URLSearchParams(useMyRouterLocation().search),
};

<RouterAdapterProvider adapter={adapter}>
  <ProviderContextProvider provider={persistenceProvider}>
    {/* route `/` → <BoardListPage/>, `/boards/:slug` → <BoardPage/>, `/items/:slug` → <ItemEditorPage/> */}
  </ProviderContextProvider>
</RouterAdapterProvider>;
```

### RouterAdapter

board-ui never imports a router. All paths it emits are **board-relative**
(`/`, `/boards/:slug`, `/items/:slug?board=:boardSlug`); the adapter maps them onto
the host URL space.

| Member | Purpose |
|---|---|
| `Link` | Component rendering an in-app link (`to`, `children`, `className`, `style`, `data-testid`, …) |
| `navigate(to)` | Imperative navigation to a board-relative path |
| `useParams()` | Hook returning route params; pages read `slug` |
| `useSearchParams()` | Hook returning the current query string; the item editor reads `board` |

`apps/kanban-ui/src/router/react-router-adapter.tsx` is the reference
implementation for `react-router-dom`.

### Optional contexts

- `BreadcrumbContext` — pages push `BreadcrumbSegment[]` via `useBreadcrumb()`; provide it
  if your shell renders a breadcrumb. The default is a no-op.
- `ConflictProvider syncEngineUrl="…"` + `<ConflictBanner/>` — only for hosts backed by
  the git sync-engine.

### Shell widgets

`SyncStatusDot` (HTTP provider connection state), `ThemeToggle` / `useTheme`
(light/dark via `data-theme` on `<html>`).

## Styles

`@awesome-markdown/board-ui/styles.css` contains the design tokens (`--bg`, `--ink`,
`--ink-muted`, `--border`, `--accent`, `--font-mono`, `--font-sans`; light and
`[data-theme="dark"]`), the self-hosted JetBrains Mono / Inter Tight fonts (resolved
relative to the CSS file, so any bundler that handles CSS `url()` picks them up), the
small utility-class set the components use, and the board-editing classes.
