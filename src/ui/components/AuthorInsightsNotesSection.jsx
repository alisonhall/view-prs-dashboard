import React, { useEffect, useRef } from 'react';

/**
 * Wraps the legacy vanilla builder (window.buildAuthorInsightsNotesSection,
 * see pr-author-insights.component.js) instead of reimplementing its markup
 * in JSX - it depends on createAuthorInsightsPrLink/createAuthorInsightsPrDataMeta
 * and several other display helpers that build DOM nodes directly, the same
 * reasoning as AuthorCreatedPrsSection.jsx.
 *
 * Unlike AuthorCreatedPrsSection, this component receives `selectedAuthor` as
 * a prop rather than reading it from a closure - renderAuthorInsights
 * (pr-author-insights.component.js) recomputes a fresh `selectedAuthor`
 * object on every call, so a plain effect keyed on [rows, selectedAuthor,
 * actorsMap] already re-runs on every author switch without needing an
 * incrementing `key` remount.
 */
export function AuthorInsightsNotesSection({ rows, selectedAuthor, actorsMap }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const section = window.buildAuthorInsightsNotesSection?.(selectedAuthor, rows, actorsMap);
    if (section) container.appendChild(section);
  }, [rows, selectedAuthor, actorsMap]);

  return <div ref={containerRef} />;
}
