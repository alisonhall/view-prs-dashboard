import React, { useCallback, useEffect, useState } from 'react';
import { PrDataContext } from './PrDataContext';

/**
 * Track C, slice C2c (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * owns the PR table's payload/selectedRepo/visiblePrNumbers as real React
 * state, replacing the "index.page.js calls window.updateReactPrTable,
 * which re-renders PrTableApp with fresh props via root.render()" pattern.
 *
 * Fixes a real latent bug found while designing this: PrTableApp used to
 * expose its own window.updateReactPrTable (a single-argument
 * `(newPayload) => setPayload(newPayload)`) via a useEffect that ran AFTER
 * mountReactPrTable's own multi-argument version was assigned, silently
 * clobbering it - so in the real running app, `selectedRepo`/
 * `visiblePrNumbers` updates from index.page.js's poll loop and
 * filter-apply pipeline were dropped after the initial mount; only
 * `payload` ever actually updated. Confirmed live (window.updateReactPrTable
 * .toString() showed the simplified single-arg version in production)
 * before this fix. Only react-app.test.jsx's isolated unit test (PrTableApp
 * mocked out, so its competing effect never ran) exercised the "real"
 * multi-argument merging logic - meaning it was tested but never actually
 * reachable end-to-end. This Provider is now the single place that assigns
 * window.updateReactPrTable, so there's no more competing assignment.
 *
 * `initialPayload`/`initialSelectedRepo`/`initialVisiblePrNumbers` seed the
 * state once at mount (mountReactPrTable, react-app.jsx) - all updates
 * after that go through window.updateReactPrTable (index.page.js's
 * updateReactTable, Track C slice C2b) or the exposed `setPayload` (used by
 * descendants like NotesSection.jsx's onDataRefresh, which applies a fresh
 * payload from its own direct POST /view-prs/notes response, bypassing the
 * vanilla bridge entirely).
 */
export function PrDataProvider({ initialPayload, initialSelectedRepo, initialVisiblePrNumbers, children }) {
  const [state, setState] = useState({
    payload: initialPayload || {},
    selectedRepo: initialSelectedRepo || '',
    visiblePrNumbers: initialVisiblePrNumbers ?? null,
  });

  useEffect(() => {
    window.updateReactPrTable = (newPayload, newSelectedRepo, newVisiblePrNumbers) => {
      setState((previous) => ({
        payload: newPayload !== undefined ? newPayload : previous.payload,
        selectedRepo: newSelectedRepo || previous.selectedRepo,
        // undefined (param omitted) keeps the previous value; null/[] are
        // meaningful ("no filter" / "everything filtered out") and must
        // overwrite it - same semantics react-app.jsx's old updateTable
        // closure had.
        visiblePrNumbers: newVisiblePrNumbers !== undefined ? newVisiblePrNumbers : previous.visiblePrNumbers,
      }));
    };
    return () => {
      delete window.updateReactPrTable;
    };
  }, []);

  const setPayload = useCallback((newPayload) => {
    setState((previous) => ({ ...previous, payload: newPayload }));
  }, []);

  const value = { ...state, setPayload };

  return <PrDataContext.Provider value={value}>{children}</PrDataContext.Provider>;
}
