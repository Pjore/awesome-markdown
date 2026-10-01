import { createContext, useContext } from 'react';

/** One breadcrumb path segment pushed by a board-ui page. `to` is board-relative. */
export interface BreadcrumbSegment {
  label: string;
  to?: string;
  /** When true, render `→` before this segment instead of `/` */
  arrow?: boolean;
}

export interface BreadcrumbContextValue {
  segments: BreadcrumbSegment[];
  setSegments: (s: BreadcrumbSegment[]) => void;
}

/**
 * Optional breadcrumb channel from board-ui pages to the host shell.
 * Without a provider the default is a no-op, so hosts that don't render a
 * breadcrumb can ignore it.
 */
export const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  segments: [],
  setSegments: () => undefined,
});

/** Used by pages to push their breadcrumb path segments. */
export function useBreadcrumb(): { setSegments: (s: BreadcrumbSegment[]) => void } {
  return useContext(BreadcrumbContext);
}
