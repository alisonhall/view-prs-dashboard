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
import { buildActivePrKey, buildExpandedInsightsKey } from './pr-row-keys';

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
  onApplyLabel,
  onUpdatePr,
  onDataRefresh,
  onViewJson,
  getPrFlags,
  checkNeedsAttention,
  activePrNumbers,
}) {
  // activePrNumbers is already a list of composite "repo::prNumber" keys
  // (see PrTableApp's combinedActivePrNumbers/buildActivePrKey) - PR
  // numbers are only unique within a repo, so matching by number alone
  // would show another repo's in-progress spinner on this row too.
  const activePrNumberSet = new Set((activePrNumbers || []).map(String));
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
          const compositeKey = buildExpandedInsightsKey(sectionKey, entry.repo, entry.data.number);
          const isExpanded = expandedInsights[compositeKey] ?? false;

          const flags = getPrFlags
            ? getPrFlags(entry.data.number, entry.repo)
            : { isFlagged: false, isInReview: false, isAcknowledged: false };

          const needsAttention = checkNeedsAttention ? checkNeedsAttention(entry) : false;
          const isActive = activePrNumberSet.has(buildActivePrKey(entry.data.number, entry.repo));

          return (
            <PrRow
              // PR numbers are only unique within a repo - now that rows
              // from other repos render alongside the current one (see
              // PrTableApp's entriesForRepo), two entries could share the
              // same key, and React would silently reuse/misreconcile one
              // row's DOM/state for the other (stale checkbox state,
              // "two children with the same key" warnings).
              key={`${entry.repo || ''}:${entry.data.number}`}
              entry={entry}
              pr={entry.data}
              // Each row's own repo, not the table-level `repo` - rows for
              // a repo other than the currently-configured one now render
              // too (see PrTableApp's entriesForRepo), and links/actions
              // (Ack, Apply Label, checkbox toggle - PrActionsCell,
              // PrNumberCell) must target that row's actual repo, not
              // whichever one happens to be selected.
              repo={entry.repo || repo}
              sectionKey={sectionKey}
              isSmartGroup={isSmartGroup}
              lifecycleSection={entry.section || lifecycleSection}
              actorsMap={actorsMap}
              isExpanded={isExpanded}
              isFlagged={flags.isFlagged}
              isInReview={flags.isInReview}
              isAcknowledged={flags.isAcknowledged}
              needsAttention={needsAttention}
              isActive={isActive}
              onToggleInsights={onToggleInsights}
              onCheckboxChange={onCheckboxChange}
              onAckAction={onAckAction}
              onApplyLabel={onApplyLabel}
              onUpdatePr={onUpdatePr}
              onDataRefresh={onDataRefresh}
              onViewJson={onViewJson}
            />
          );
        })}
      </tbody>
    </table>
  );
}
