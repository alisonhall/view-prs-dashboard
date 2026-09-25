import React, { useCallback, useEffect, useRef, useState } from 'react';
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
export function PrDataProvider({
  initialPayload,
  initialSelectedRepo,
  initialVisiblePrNumbers,
  initialSelectedAuthorLogin,
  initialStatsViewState,
  children,
}) {
  const [state, setState] = useState({
    payload: initialPayload || {},
    selectedRepo: initialSelectedRepo || '',
    visiblePrNumbers: initialVisiblePrNumbers ?? null,
    selectedAuthorLogin: initialSelectedAuthorLogin || '',
    statsViewState: initialStatsViewState || {},
  });

  // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md): a read
  // bridge mirroring window.updateReactPrTable's write side, letting a
  // handful of index.page.js DI wirings prefer the same payload the visible
  // UI is currently showing over the raw, always-freshest vanilla
  // `latestStoredPayload` (see that item's own writeup for why this is the
  // more-correct choice for those specific consumers - it respects
  // pollForDataChanges' deliberate "don't disturb an in-progress edit"
  // deferral, which the raw vanilla variable doesn't). A ref, not `state`
  // captured directly, so the closure below (assigned once, via the `[]`
  // effect) always reads the latest payload rather than whatever `state`
  // was at mount time.
  const payloadRef = useRef(state.payload);
  payloadRef.current = state.payload;

  useEffect(() => {
    window.getReactPrTablePayload = () => payloadRef.current;
    return () => {
      delete window.getReactPrTablePayload;
    };
  }, []);

  useEffect(() => {
    window.updateReactPrTable = (newPayload, newSelectedRepo, newVisiblePrNumbers) => {
      setState((previous) => ({
        ...previous,
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

  // Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): the
  // Author Insights tab's "which author is currently selected" value,
  // pushed from pr-author-insights.component.js's renderAuthorInsights on
  // every render (both explicit user picks and its own
  // auto-select-first-author fallback) - not from the selection handler
  // alone, since that fallback bypasses it. Read directly by
  // AuthorInsightsSelector/AuthorInsightsHeader/AuthorCreatedPrsSection/
  // AuthorInsightsNotesSection/AuthorInsightsCommentsSection.
  useEffect(() => {
    window.updateReactSelectedAuthorLogin = (login) => {
      setState((previous) => ({ ...previous, selectedAuthorLogin: login || '' }));
    };
    return () => {
      delete window.updateReactSelectedAuthorLogin;
    };
  }, []);

  // Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): a
  // snapshot of the Review Stats tab's sort/filter/topN/minComments/
  // date-range settings, pushed from index.page.js's
  // updateStatsViewStateAndRerender whenever ReviewStatsControls commits a
  // change. ReviewStatsContent doesn't read the individual fields from
  // here - it recomputes stats via window.buildReviewerStats/
  // applyStatsControls, which already read the live vanilla statsViewState
  // object by closure - this field exists purely so a settings change
  // triggers a Context update (and therefore a re-render), the same way a
  // payload change does.
  useEffect(() => {
    window.updateReactStatsViewState = (nextStatsViewState) => {
      setState((previous) => ({ ...previous, statsViewState: nextStatsViewState || {} }));
    };
    return () => {
      delete window.updateReactStatsViewState;
    };
  }, []);

  const setPayload = useCallback((newPayload) => {
    setState((previous) => ({ ...previous, payload: newPayload }));
  }, []);

  const value = { ...state, setPayload };

  return <PrDataContext.Provider value={value}>{children}</PrDataContext.Provider>;
}
