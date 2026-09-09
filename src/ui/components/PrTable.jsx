/**
 * PrTable - Table wrapper component
 *
 * Renders the same 11-column <table class="pr-data-table"> structure as
 * vanilla's components/pr-section-table.component.js (colgroup + thead +
 * tbody), so the shared index.css rules apply without any React-only styles.
 *
 * @module components/PrTable
 */

import React from 'react';
import { PrRow } from './PrRow';

const TABLE_COLUMN_CLASSES = [
  'pr-col-select',
  'pr-col-attention',
  'pr-col-number',
  'pr-col-status',
  'pr-col-approved',
  'pr-col-title',
  'pr-col-author',
  'pr-col-labels',
  'pr-col-check',
  'pr-col-date',
  'pr-col-actions',
];

const TABLE_HEADERS = [
  { shortLabel: 'Sel', fullLabel: 'Select PR', compact: true },
  { shortLabel: 'Attn', fullLabel: 'Needs Attention', compact: true },
  'PR',
  'STATUS',
  'APPROVED',
  'TITLE',
  'AUTHOR',
  'LABELS',
  'CHK',
  null,
  'ACTIONS',
];

/**
 * PR Table Component
 *
 * @param {Object} props
 * @param {Array} props.prs - PR entries to render ({ prNumber, repo, section, data, updatedAt })
 * @param {string} props.repo
 * @param {string} props.sectionKey - Section identifier
 * @param {boolean} props.isSmartGroup - True if in smart group
 * @param {string} props.lifecycleSection - Lifecycle status for badges
 * @param {string} props.dateHeader - Header label for the date column
 * @param {Object} props.actorsMap
 * @param {Object} props.expandedInsights - Expanded insights state
 * @param {Function} props.onToggleInsights - Toggle insights callback
 * @param {Function} props.onCheckboxChange - Checkbox change callback
 * @param {Function} props.onAckAction - Ack action callback
 * @returns {JSX.Element}
 */
export function PrTable({
  prs,
  repo,
  sectionKey,
  isSmartGroup,
  lifecycleSection,
  dateHeader,
  actorsMap,
  expandedInsights,
  onToggleInsights,
  onCheckboxChange,
  onAckAction,
  onDataRefresh,
  getPrFlags,
  checkNeedsAttention,
}) {
  return (
    <table className="pr-data-table">
      <colgroup>
        {TABLE_COLUMN_CLASSES.map((columnClass) => (
          <col key={columnClass} className={columnClass} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {TABLE_HEADERS.map((header, index) => {
            const columnClass = TABLE_COLUMN_CLASSES[index];
            if (header && typeof header === 'object' && header.compact) {
              return (
                <th key={columnClass} className={`${columnClass} compact-hover-header`} scope="col" title={header.fullLabel} aria-label={header.fullLabel}>
                  <span className="compact-header-abbrev">{header.shortLabel}</span>
                  <span className="compact-header-hover">{header.fullLabel}</span>
                </th>
              );
            }
            return (
              <th key={columnClass} className={columnClass} scope="col">
                {header === null ? dateHeader : header}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {prs.map((entry) => {
          const compositeKey = `${sectionKey}:${entry.data.number}`;
          const isExpanded = expandedInsights[compositeKey] ?? false;

          const flags = getPrFlags
            ? getPrFlags(entry.data.number)
            : { isFlagged: false, isInReview: false, isAcknowledged: false };

          const needsAttention = checkNeedsAttention ? checkNeedsAttention(entry) : false;

          return (
            <PrRow
              key={entry.data.number}
              entry={entry}
              pr={entry.data}
              repo={repo}
              sectionKey={sectionKey}
              isSmartGroup={isSmartGroup}
              lifecycleSection={entry.section || lifecycleSection}
              actorsMap={actorsMap}
              isExpanded={isExpanded}
              isFlagged={flags.isFlagged}
              isInReview={flags.isInReview}
              isAcknowledged={flags.isAcknowledged}
              needsAttention={needsAttention}
              onToggleInsights={onToggleInsights}
              onCheckboxChange={onCheckboxChange}
              onAckAction={onAckAction}
              onDataRefresh={onDataRefresh}
            />
          );
        })}
      </tbody>
    </table>
  );
}
