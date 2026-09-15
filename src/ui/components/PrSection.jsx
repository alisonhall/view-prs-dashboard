/**
 * PrSection - Smart group or lifecycle section component
 *
 * Renders the same <details>/<summary> shell as vanilla's
 * helpers/pr-section-shell.helpers.js (title + total count + attention
 * count), wrapping a <table class="pr-data-table">.
 *
 * @module components/PrSection
 */

import React from 'react';
import { PrTable } from './PrTable';

/**
 * PR Section Component
 *
 * @param {Object} props
 * @param {Object} props.section - Section configuration and data
 * @param {string} props.section.key - Section identifier (e.g., 'flagged', 'open')
 * @param {string} props.section.title - Section display title
 * @param {Array} props.section.prs - PR entries for this section
 * @param {boolean} props.section.isSmartGroup - True if this is a smart group
 * @param {string} props.section.lifecycleSection - Lifecycle status for badges
 * @param {string} props.section.dateHeader - Header label for the date column
 * @param {number} props.section.attentionCount
 * @param {boolean} props.section.defaultOpen - Default open/closed state
 * @param {string} props.repo
 * @param {Object} props.actorsMap
 * @param {boolean} props.isOpen - Current open/closed state
 * @param {Object} props.expandedInsights - Map of expanded insights by composite key
 * @param {Function} props.onToggleSection - Callback to toggle section
 * @param {Function} props.onToggleInsights - Callback to toggle insights
 * @param {Function} props.onCheckboxChange - Callback for checkbox changes
 * @param {Function} props.onAckAction - Callback for Ack actions
 * @returns {JSX.Element}
 */
export function PrSection({
  section,
  repo,
  actorsMap,
  isOpen,
  expandedInsights,
  onToggleSection,
  onToggleInsights,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
  onDataRefresh,
  onViewJson,
  getPrFlags,
  checkNeedsAttention,
  activePrNumbers,
}) {
  const { key, title, prs, totalCount, isSmartGroup, lifecycleSection, dateHeader, attentionCount } = section;
  // `totalCount` (the full, undeduplicated row count) is what the "Total
  // PRs in section" badge must show - `prs` is only the rendered/
  // deduplicated subset (see PrTableApp.jsx), which undercounts whenever a
  // PR is already shown in a smart group above. Falls back to prs.length
  // for any caller that hasn't been updated to pass totalCount.
  const displayedTotalCount = typeof totalCount === 'number' ? totalCount : prs.length;

  return (
    <details
      className={`pr-group-section pr-group-section-${key}`}
      data-pr-section={key}
      open={isOpen}
      onToggle={(e) => {
        if (e.target.open !== isOpen) {
          onToggleSection(key);
        }
      }}
    >
      <summary className="pr-group-section-summary">
        <span className="pr-group-section-title">{title}</span>
        <span className="pr-group-section-counts">
          <span className="pr-group-section-count" title="Total PRs in section">
            {displayedTotalCount}
          </span>
          {attentionCount > 0 && (
            <span className="pr-group-section-attention-count" title="PRs marked as needs attention in this section">
              Attention: {attentionCount}
            </span>
          )}
        </span>
      </summary>

      <div className="pr-group-section-content">
        {prs.length > 0 ? (
          <PrTable
            prs={prs}
            repo={repo}
            sectionKey={key}
            isSmartGroup={isSmartGroup}
            lifecycleSection={lifecycleSection}
            dateHeader={dateHeader}
            actorsMap={actorsMap}
            expandedInsights={expandedInsights}
            onToggleInsights={onToggleInsights}
            onCheckboxChange={onCheckboxChange}
            onAckAction={onAckAction}
            onApplyLabel={onApplyLabel}
            onDataRefresh={onDataRefresh}
            onViewJson={onViewJson}
            getPrFlags={getPrFlags}
            checkNeedsAttention={checkNeedsAttention}
            activePrNumbers={activePrNumbers}
          />
        ) : (
          <pre>(none)</pre>
        )}
      </div>
    </details>
  );
}
