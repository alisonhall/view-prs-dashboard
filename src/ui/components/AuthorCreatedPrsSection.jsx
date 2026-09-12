/**
 * AuthorCreatedPrsSection - React-owned "PRs created by this author"
 * section for the Author Insights tab, replacing
 * pr-author-insights.component.js's renderCreatedPrsSection().
 *
 * Phase 3 (see REACT_MIGRATION_PLAN.md). This section is read-only (no
 * drafts, no server writes), so it's a lower-risk pick than the manual
 * comments composer/PR-linked notes sections still remaining in this tab.
 *
 * Deliberately NOT reimplemented item-by-item in JSX: each item's DOM is
 * built by calling window.buildAuthorInsightsCreatedPrsSection(rows) -
 * which returns the exact same <section> node
 * pr-author-insights.component.js's own buildCreatedPrsSection() builds
 * (title, list, "View in table" links via the already-React-safe
 * navigateToPrInTable, and per-PR status/approval/CHK/conversation meta
 * via createAuthorInsightsPrDataMeta, which itself depends on several
 * more small display helpers) - and inserted via a ref. Reimplementing
 * that whole derivation chain in JSX for this slice would duplicate a
 * lot of logic for no real benefit; the same "wrap the legacy
 * DOM-builder" choice StatsVisuals already made for the Review Stats
 * chart visuals.
 *
 * Mounted once into the static #author-insights-created-prs-root
 * container and updated via
 * window.updateAuthorInsightsCreatedPrs(rows) - pr-author-insights
 * .component.js's renderAuthorInsights never rebuilds this container
 * once React owns it, only the other content around it (the same
 * container-split fix already applied to #author-insights-selector-root
 * and Review Stats' #stats-controls-root/#stats-content-root).
 *
 * @module components/AuthorCreatedPrsSection
 */

import React, { useEffect, useRef } from 'react';

// Mounted with a `key` that changes on every update() call (see
// react-app.jsx's mountAuthorCreatedPrsSection) rather than depending on
// `rows` here: the *same* `rows` array reference gets passed again
// whenever only the selected author changes (renderAuthorInsights re-runs
// with authorInsightsState.latestRows unchanged), which
// buildAuthorInsightsCreatedPrsSection needs to react to (it reads
// authorInsightsState.selectedAuthorLogin internally) even though `rows`
// itself didn't change identity. A changing `key` forces a fresh mount -
// and therefore a fresh effect run - on every real update, matching
// AuthorInsightsSelector's own reasoning for the same bridge shape.
export function AuthorCreatedPrsSection({ rows }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.innerHTML = '';
    const section = window.buildAuthorInsightsCreatedPrsSection?.(rows);
    if (section) {
      container.appendChild(section);
    }
  }, [rows]);

  return <div ref={containerRef} />;
}
