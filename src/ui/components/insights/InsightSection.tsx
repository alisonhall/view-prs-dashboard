/**
 * InsightSection - generic collapsible sub-section used throughout a PR's
 * insights (the detail pane's tabs). Matches vanilla's
 * createInsightSection() (index.page.js): a bare
 * <details class="insight-section"> with a data-insight-key attribute and
 * a plain-text <summary>. `defaultOpen` starts it open (the detail pane's
 * tabs, where it's the tab's content); after that the user opens and
 * closes it.
 *
 * @module components/insights/InsightSection
 */

import type { ReactNode } from 'react';

export interface InsightSectionProps {
  summaryText: string;
  // Richer summary content, in place of summaryText.
  summaryContent?: ReactNode;
  sectionKey?: string;
  className?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

export function InsightSection({
  summaryText,
  summaryContent,
  sectionKey,
  className = '',
  defaultOpen = false,
  children,
}: InsightSectionProps) {
  const key = String(sectionKey || summaryText || '').trim().toLowerCase();
  return (
    <details
      className={['insight-section', className].filter(Boolean).join(' ')}
      data-insight-key={key}
      open={defaultOpen || undefined}
    >
      <summary>{summaryContent || summaryText}</summary>
      {children}
    </details>
  );
}
