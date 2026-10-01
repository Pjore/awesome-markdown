import React, { useMemo } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
  type NavigateFunction,
} from 'react-router-dom';
import { RouterAdapterProvider } from '@awesome-markdown/board-ui';
import type { RouterAdapter, RouterLinkProps } from '@awesome-markdown/board-ui';

function ReactRouterLink(props: RouterLinkProps): React.ReactElement {
  return <Link {...props} />;
}

function useRouterSearchParams(): URLSearchParams {
  return useSearchParams()[0];
}

/**
 * Builds a board-ui RouterAdapter on top of react-router. kanban-ui mounts the
 * board at the URL root, so board-relative paths are used verbatim.
 */
export function createReactRouterAdapter(navigate: NavigateFunction): RouterAdapter {
  return {
    Link: ReactRouterLink,
    navigate: (to) => void navigate(to),
    useParams,
    useSearchParams: useRouterSearchParams,
  };
}

/** Binds board-ui to the enclosing react-router `<BrowserRouter>`. */
export function ReactRouterAdapterProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const navigate = useNavigate();
  const adapter = useMemo(() => createReactRouterAdapter(navigate), [navigate]);
  return <RouterAdapterProvider adapter={adapter}>{children}</RouterAdapterProvider>;
}
