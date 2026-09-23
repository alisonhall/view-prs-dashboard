/**
 * AuthorInsightsHeader - React-owned "Showing insights for X" line for the
 * Author Insights tab.
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `selectedAuthorLogin`/`payload.actorsMap` straight from PrDataContext
 * instead of being pushed a pre-resolved name via
 * window.updateAuthorInsightsHeader (deleted) - renderAuthorInsights
 * already clears selectedAuthorLogin to "" in both of its empty-state
 * branches (no local rows / no authors found), so this component hiding
 * itself whenever selectedAuthorLogin is empty reproduces the same
 * empty-state behavior without needing its own separate signal.
 *
 * @module components/AuthorInsightsHeader
 */

import React from 'react';
import { usePrData } from '../state/PrDataContext';

const resolveActorDisplayName = (login, actorsMap, fallback) =>
  window.resolveActorDisplayName ? window.resolveActorDisplayName(login, actorsMap, fallback) : String(fallback || login || '').trim();

export function AuthorInsightsHeader() {
  const { payload, selectedAuthorLogin } = usePrData();

  if (!selectedAuthorLogin) {
    return null;
  }

  const actorsMap = payload?.actorsMap || {};
  const selectedAuthorName = resolveActorDisplayName(selectedAuthorLogin, actorsMap, selectedAuthorLogin);

  return (
    <div className="author-insights-selected">
      Showing insights for {selectedAuthorName}
    </div>
  );
}
