import React, { createContext, useContext } from 'react';

/**
 * Router-agnostic navigation seam for board-ui.
 *
 * board-ui never imports a router. Every path it produces is *board-relative*
 * (`/`, `/boards/:slug`, `/items/:slug?board=…`); the host app maps those onto
 * its own URL space (e.g. prefixing `/w/:workspace`) inside its adapter.
 */

/** Props board-ui passes to `RouterAdapter.Link`. */
export interface RouterLinkProps {
  /** Board-relative target path, e.g. `/boards/board-all`. */
  to: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  'aria-label'?: string;
  'data-testid'?: string;
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLAnchorElement>;
}

export interface RouterAdapter {
  /** Renders an in-app link to a board-relative path. */
  Link: React.ComponentType<RouterLinkProps>;
  /** Navigates to a board-relative path (may include a `?query`). */
  navigate: (to: string) => void;
  /** Hook: path params of the current route (`slug` for board/item pages). */
  useParams: () => Record<string, string | undefined>;
  /** Hook: query-string params of the current location. */
  useSearchParams: () => URLSearchParams;
}

const RouterAdapterContext = createContext<RouterAdapter | null>(null);

interface RouterAdapterProviderProps {
  adapter: RouterAdapter;
  children: React.ReactNode;
}

/** Injects the host app's router adapter. Required above any board-ui page. */
export function RouterAdapterProvider({
  adapter,
  children,
}: RouterAdapterProviderProps): React.ReactElement {
  return (
    <RouterAdapterContext.Provider value={adapter}>{children}</RouterAdapterContext.Provider>
  );
}

/** Returns the bound router adapter. Throws outside `RouterAdapterProvider`. */
export function useRouterAdapter(): RouterAdapter {
  const ctx = useContext(RouterAdapterContext);
  if (ctx === null) {
    throw new Error('useRouterAdapter must be used inside a RouterAdapterProvider');
  }
  return ctx;
}

/** Convenience link component that delegates to the adapter's `Link`. */
export function RouterLink(props: RouterLinkProps): React.ReactElement {
  const { Link } = useRouterAdapter();
  return <Link {...props} />;
}
