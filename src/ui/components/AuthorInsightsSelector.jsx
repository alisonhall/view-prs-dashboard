/**
 * AuthorInsightsSelector - React-owned "Author" dropdown for the Author
 * Insights tab, replacing pr-author-insights.component.js's
 * renderAuthorSelector() (deleted).
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `payload`/`selectedAuthorLogin` straight from PrDataContext instead of
 * being pushed a pre-built option list + selected login via
 * window.updateAuthorInsightsSelector (deleted) - options are rebuilt from
 * the raw payload via useAuthorInsights()'s buildAuthorInsightsEntries
 * (Phase 7, sub-phase 7.0 - see REACT_MIGRATION_PLAN.md). Options are
 * deliberately empty when there are no local rows at all, even if
 * actorsMap has entries on its own - matching the empty-state guards
 * below - and (deferred-items follow-up, full vanilla-to-React sweep, see
 * REACT_MIGRATION_PLAN.md) this component renders those two empty-state
 * messages itself ("No local rows available for author insights." / "No
 * authors found in the current local data scope.").
 *
 * Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 2): this component now owns the "which author is selected"
 * validation itself - previously pr-author-insights.component.js's
 * renderAuthorInsights did this (resolveValidAuthorLogin, falling back to
 * the first option whenever the current selection no longer exists in
 * `options`), driven by window.selectAuthorInsightsAuthor on every
 * explicit pick AND by a vanilla render pipeline on every data
 * change/tab-activation (both deleted outright this phase). The
 * useEffect below reproduces the same rule, reactively: it compares
 * `selectedAuthorLogin` against the live `options` on every render (not
 * just on explicit picks), using the exact same resolveValidAuthorLogin
 * useNavigateToAuthorInsights.jsx (state/) already uses for this identical
 * validation. Guards each setSelectedAuthorLogin call on the value
 * actually changing - `options`/`rows` are recomputed fresh every render
 * (not memoized), so an unguarded call here would set state every render
 * and loop forever.
 *
 * Explicit selection (`<select>`'s onChange) writes `setSelectedAuthorLogin`
 * directly now, not through a window.* bridge - the chosen value always
 * comes from an `<option>` this component itself rendered from `options`,
 * so it's valid by construction and needs no extra validation pass.
 *
 * @module components/AuthorInsightsSelector
 */

import { useEffect } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { resolveValidAuthorLogin } from '../helpers/pr-author-insights-display.helpers.js';

export function AuthorInsightsSelector() {
  const { payload, selectedAuthorLogin, setSelectedAuthorLogin } = usePrData();
  const { buildAuthorInsightsEntries } = useAuthorInsights();
  const rows = Object.values(payload?.byPrNumber || {});
  const actorsMap = payload?.actorsMap || {};
  // Recomputed fresh every render (same shape useNavigateToAuthorInsights.jsx
  // already uses for this identical validation, not memoized there
  // either) - a useMemo wrap would only mask the same per-render recompute
  // one level up, not avoid it, since `rows`/`actorsMap` above are
  // themselves fresh every render too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = rows.length ? buildAuthorInsightsEntries(rows, actorsMap) : [];

  // Each setSelectedAuthorLogin call below is guarded on the *value*
  // actually changing, not just validation re-running, so this effect
  // running on every render (since `options` above is a fresh reference
  // each time) is harmless - it stabilizes once selectedAuthorLogin
  // genuinely matches what resolveValidAuthorLogin resolves to.
  useEffect(() => {
    const validatedLogin = resolveValidAuthorLogin(options, selectedAuthorLogin);
    if (validatedLogin !== selectedAuthorLogin) {
      setSelectedAuthorLogin(validatedLogin);
    }
  }, [options, selectedAuthorLogin, setSelectedAuthorLogin]);

  if (!rows.length) {
    return <p className="stats-empty">No local rows available for author insights.</p>;
  }
  if (!options.length) {
    return <p className="stats-empty">No authors found in the current local data scope.</p>;
  }

  return (
    <div className="author-insights-controls">
      <label className="author-insights-label">
        Author
        <select
          id="author-insights-select"
          className="author-insights-select"
          value={selectedAuthorLogin || ''}
          onChange={(e) => setSelectedAuthorLogin(e.target.value)}
        >
          {options.map((author) => (
            <option key={author.login} value={author.login}>
              {author.name || author.login}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
