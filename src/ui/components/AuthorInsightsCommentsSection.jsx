import React, { useEffect, useRef } from 'react';

/**
 * Wraps the legacy vanilla builder (window.buildAuthorInsightsCommentsSection,
 * see pr-author-insights.component.js) instead of reimplementing its markup
 * in JSX - same reasoning as AuthorCreatedPrsSection/AuthorInsightsNotesSection,
 * but with a sharper edge here: this section owns mutable composer/edit
 * draft state (authorInsightsState/draftHelpers) and server-write side
 * effects (saving/editing comments via postJson). None of that lives in
 * this component - it's entirely inside the wrapped vanilla builder and its
 * own event listeners on the DOM nodes it creates, so handing React only
 * the resulting DOM node (via a ref) is safe: React never re-renders this
 * subtree on its own, so it can never interrupt an in-progress edit or drop
 * a keystroke the way reimplementing the form in JSX with naive state might.
 *
 * Renders nothing when `selectedAuthor` is falsy (the "no rows"/"no
 * authors" empty states in renderAuthorInsights clear this section by
 * passing null), matching AuthorInsightsHeader's same-shaped guard.
 *
 * Like AuthorInsightsNotesSection (and unlike AuthorCreatedPrsSection),
 * `selectedAuthor` is a freshly-computed object on every render call from
 * renderAuthorInsights, so a plain effect dependency array already re-runs
 * on every author switch without needing an incrementing `key`.
 */
export function AuthorInsightsCommentsSection({ rows, selectedAuthor, actorsMap }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    if (!selectedAuthor) return;
    const section = window.buildAuthorInsightsCommentsSection?.(selectedAuthor, rows, actorsMap);
    if (section) container.appendChild(section);
  }, [rows, selectedAuthor, actorsMap]);

  return <div ref={containerRef} />;
}
