/**
 * PrTable - one section's table of PR rows. A real <table> (rows, column
 * headers), named by its section title, so each row's controls can be
 * found by role and two copies of the same PR in different sections can
 * be told apart.
 *
 * Columns: select, Signals, Pull request, Who, Review, CHK·MRG, Size,
 * Activity, Actions. Size and Activity hide while the detail pane is open
 * (`showSizeAndActivity`, phase 4).
 *
 * @module components/PrTable
 */

import type { PrEntry } from '../types/pr-data.ts';
import { PrRow, type PrRowHandlers } from './PrRow';
import { buildActivePrKey, buildExpandedInsightsKey } from './pr-row-keys';
import { useTooltipController } from './ui/Tooltip';

import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
type PrFlags = { isFlagged: boolean; isInReview: boolean; isAcknowledged: boolean };

interface Column {
  key: string;
  label: string;
  // The header's accessible name (the visible label is then hidden from
  // screen readers), and its hover tooltip.
  fullLabel?: string;
  hideLabel?: boolean;
  optional?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'select', label: 'Select', hideLabel: true },
  { key: 'signals', label: 'Signals', fullLabel: 'Signals: changed, needs attention, flagged, in review' },
  { key: 'title', label: 'Pull request' },
  { key: 'who', label: 'Who', fullLabel: 'Author' },
  { key: 'review', label: 'Review', fullLabel: 'Review: approvals, open conversations, viewed files, notes, assigned' },
  { key: 'checks', label: 'CHK·MRG', fullLabel: 'Checks and mergeability' },
  { key: 'size', label: 'Size', optional: true },
  { key: 'activity', label: 'Activity', optional: true },
  { key: 'actions', label: 'Actions' },
];

export interface PrTableProps extends PrRowHandlers {
  prs: PrEntry[];
  repo: string;
  sectionKey: string;
  label?: string;
  isSmartGroup?: boolean;
  lifecycleSection?: string;
  actorsMap?: ActorsMap;
  expandedInsights: Record<string, boolean>;
  getPrFlags?: (prNumber: string | number | undefined, repo?: string) => PrFlags;
  getAttentionReasons?: (entry: PrEntry) => string[];
  activePrNumbers?: string[];
  queuedPrNumbers?: string[];
  showSizeAndActivity?: boolean;
}

const NO_FLAGS: PrFlags = { isFlagged: false, isInReview: false, isAcknowledged: false };
const NO_REASONS: string[] = [];

export function PrTable({
  prs,
  repo,
  sectionKey,
  label,
  isSmartGroup = false,
  lifecycleSection,
  actorsMap = {},
  expandedInsights,
  getPrFlags,
  getAttentionReasons,
  activePrNumbers,
  queuedPrNumbers,
  showSizeAndActivity = true,
  ...handlers
}: PrTableProps) {
  useTooltipController();
  const columns = COLUMNS.filter((column) => showSizeAndActivity || !column.optional);
  // Composite "repo::prNumber" keys: PR numbers are only unique within a repo.
  const activeKeys = new Set((activePrNumbers || []).map(String));
  const queuedKeys = new Set((queuedPrNumbers || []).map(String));

  return (
    <table className="pr-table" aria-label={label || undefined}>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} className={`pr-col-${column.key}`} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={`pr-head-${column.key}`}>
              {column.hideLabel ? (
                <span className="ui-visually-hidden">{column.label}</span>
              ) : column.fullLabel ? (
                // The abbreviation is shown (with the full name on hover);
                // screen readers get the full name as the header's name.
                <>
                  <span aria-hidden="true" data-tip={column.fullLabel} data-tip-on="hover">
                    {column.label}
                  </span>
                  <span className="ui-visually-hidden">{column.fullLabel}</span>
                </>
              ) : (
                column.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prs.map((entry) => {
          const data = entry.data || {};
          const rowRepo = entry.repo || repo;
          const activeKey = buildActivePrKey(data.number ?? '', entry.repo);
          // Plain values, not objects/arrays, so the memoized row only
          // re-renders when one actually changes.
          const flags = getPrFlags ? getPrFlags(data.number, entry.repo) : NO_FLAGS;
          const attentionReasons = (getAttentionReasons ? getAttentionReasons(entry) : NO_REASONS).join('\n');
          return (
            <PrRow
              // PR numbers are only unique within a repo.
              key={`${entry.repo || ''}:${data.number}`}
              entry={entry}
              pr={data}
              // Each row's own repo: rows from other repos render too, and
              // links/actions must target that repo.
              repo={rowRepo}
              sectionKey={sectionKey}
              isSmartGroup={isSmartGroup}
              lifecycleSection={entry.section || lifecycleSection}
              actorsMap={actorsMap}
              isExpanded={expandedInsights[buildExpandedInsightsKey(sectionKey, entry.repo, data.number ?? '')] ?? false}
              isFlagged={flags.isFlagged}
              isInReview={flags.isInReview}
              isAcknowledged={flags.isAcknowledged}
              attentionReasons={attentionReasons}
              isActive={activeKeys.has(activeKey)}
              isQueued={queuedKeys.has(activeKey)}
              columnCount={columns.length}
              showSizeAndActivity={showSizeAndActivity}
              {...handlers}
            />
          );
        })}
      </tbody>
    </table>
  );
}
