/**
 * InsightSection - generic collapsible sub-section used throughout the
 * "More insights" panel. Matches vanilla's createInsightSection()
 * (index.page.js): a bare <details class="insight-section"> with a
 * data-insight-key attribute and a plain-text <summary>.
 *
 * @module components/insights/InsightSection
 */

import React from 'react';

export function InsightSection({ summaryText, summaryContent, sectionKey, className = '', children }) {
  const key = String(sectionKey || summaryText || '').trim().toLowerCase();
  return (
    <details className={['insight-section', className].filter(Boolean).join(' ')} data-insight-key={key}>
      <summary>{summaryContent || summaryText}</summary>
      {children}
    </details>
  );
}
