import { createContext, useContext } from 'react';

/**
 * Track C, slice C2c (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * shared PR-table payload/repo/visible-filter state, owned by
 * <PrDataProvider /> (mounted once inside mountReactPrTable, wrapping
 * PrTableApp - see react-app.jsx). Replaces PrTableApp's own
 * useState(initialPayload) + prop-resync useEffect, which existed only
 * because updates used to arrive as fresh root.render() calls with new
 * props rather than a real state update.
 */
export const PrDataContext = createContext(null);

export function usePrData() {
  const context = useContext(PrDataContext);
  if (!context) {
    throw new Error('usePrData() must be called within a <PrDataProvider>');
  }
  return context;
}
