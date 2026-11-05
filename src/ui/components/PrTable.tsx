/**
 * PrTable - one section's table of PR rows. A real <table> (rows, column
 * headers), named by its section title, so each row's controls can be
 * found by role and two copies of the same PR in different sections can
 * be told apart.
 *
 * Columns: select, Signals, Pull request, Who, Review, CHK·MRG, Size,
 * Activity, Actions - all of them, with the detail pane docked too (its
 * cells then take two lines where they need to; pr-table.css).
 *
 * With Settings › Appearance's "Group rows by repo", rows from more than
 * one repo go in a body per repo, under its heading (groupRowsByRepo). The
 * Actions header holds the section's sort (PrSectionSortMenu), and
 * "Re-sort" when the rows are held in an order the sort no longer gives
 * (useHeldSectionOrder).
 *
 * The detail pane's keyboard selection, while focus is in the table (on
 * any row control, not while typing or when the key was already used):
 * - ↑/↓ select the row with focus, or move from the selected row to the
 *   one above/below, and move focus to that row's PR link.
 * - Esc clears the selection.
 *
 * @module components/PrTable
 */

import { useRef, type KeyboardEvent } from 'react';
import type { PrEntry } from '../types/pr-data.ts';
import { PrRow, type PrRowHandlers } from './PrRow';
import { buildActivePrKey, buildExpandedInsightsKey } from './pr-row-keys';
import { useTooltipController } from './ui/Tooltip';
import { usePrSectionPreferences } from '../state/PrSectionPreferencesProvider';
import { groupRowsByRepo } from '../helpers/pr-repo-grouping.helpers.ts';
import { ShowRowRepoContext } from '../state/ShowRowRepoContext';
import { PrSectionSortMenu } from './PrSectionSortMenu';

import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
type PrFlags = { isFlagged: boolean; isInReview: boolean; isAcknowledged: boolean };

interface Column {
  key: string;
  label: string;
  // The header's accessible name (the visible label is then hidden from
  // screen readers), and its hover tooltip.
  fullLabel?: string;
  hideLabel?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'select', label: 'Select', hideLabel: true },
  { key: 'signals', label: 'Signals', fullLabel: 'Signals: changed, needs attention, flagged, in review' },
  { key: 'title', label: 'Pull request' },
  { key: 'who', label: 'Author' },
  { key: 'review', label: 'Review', fullLabel: 'Review: approvals, open conversations, viewed files, notes, assigned, review requested' },
  { key: 'checks', label: 'CHK·MRG', fullLabel: 'Checks and mergeability' },
  { key: 'size', label: 'Size' },
  { key: 'activity', label: 'Activity' },
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
  // By composite key (buildExpandedInsightsKey): rows showing their
  // summary.
  expandedInsights: Record<string, boolean>;
  // The selected PR's buildActivePrKey key ("repo::number"), if any.
  selectedPrKey?: string;
  // Select a PR (no toggling); false when it didn't happen (the user kept
  // unsaved notes on the current one).
  onSelectPr?: (prNumber: string, repo: string) => boolean | undefined;
  onClearSelection?: () => void;
  getPrFlags?: (prNumber: string | number | undefined, repo?: string) => PrFlags;
  getAttentionReasons?: (entry: PrEntry) => string[];
  activePrNumbers?: string[];
  queuedPrNumbers?: string[];
  // The rows are held where they were while you work in the section, and
  // its sort would now order them differently: the Actions header offers
  // "Re-sort" (onResort) in place of its label.
  orderChanged?: boolean;
  onResort?: () => void;
}

const NO_FLAGS: PrFlags = { isFlagged: false, isInReview: false, isAcknowledged: false };
const NO_REASONS: string[] = [];

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

export function PrTable({
  prs,
  repo,
  sectionKey,
  label,
  isSmartGroup = false,
  lifecycleSection,
  actorsMap = {},
  expandedInsights,
  selectedPrKey = '',
  onSelectPr,
  onClearSelection,
  getPrFlags,
  getAttentionReasons,
  activePrNumbers,
  queuedPrNumbers,
  orderChanged = false,
  onResort,
  ...handlers
}: PrTableProps) {
  useTooltipController();
  const tableRef = useRef<HTMLTableElement>(null);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isEditable(event.target)) return;
    if (event.key === 'Escape') {
      if (!selectedPrKey) return;
      event.preventDefault();
      onClearSelection?.();
      return;
    }
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const focusedRow = (event.target as Element).closest('tr.pr-row');
    if (!delta || !focusedRow || !tableRef.current) return;
    event.preventDefault();
    const rows = Array.from(tableRef.current.querySelectorAll<HTMLTableRowElement>('tbody > tr.pr-row'));
    const keyOf = (row: HTMLTableRowElement) => buildActivePrKey(row.dataset.prNumber ?? '', row.dataset.repo);
    const focusedIndex = rows.indexOf(focusedRow as HTMLTableRowElement);
    const fromSelected = keyOf(focusedRow as HTMLTableRowElement) === selectedPrKey;
    const target = fromSelected ? rows[Math.min(Math.max(focusedIndex + delta, 0), rows.length - 1)] : focusedRow as HTMLTableRowElement;
    if (!target || (fromSelected && target === focusedRow)) return;
    if (onSelectPr?.(target.dataset.prNumber ?? '', target.dataset.repo ?? '')) {
      target.querySelector<HTMLElement>('.pr-link')?.focus();
    }
  };
  const columns = COLUMNS;
  // Composite "repo::prNumber" keys: PR numbers are only unique within a repo.
  const activeKeys = new Set((activePrNumbers || []).map(String));
  const queuedKeys = new Set((queuedPrNumbers || []).map(String));
  // Settings › Appearance's "Group rows by repo": with rows from more than
  // one, each repo's (in their order) under a heading, repos A-Z.
  const { groupByRepo } = usePrSectionPreferences();
  const groups = groupRowsByRepo(prs, groupByRepo);

  const renderRow = (entry: PrEntry) => {
    const data = entry.data || {};
    const rowRepo = entry.repo || repo;
    const activeKey = buildActivePrKey(data.number ?? '', entry.repo);
    // Plain values, not objects/arrays, so the memoized row only
    // re-renders when one actually changes.
    const flags = getPrFlags ? getPrFlags(data.number, entry.repo) : NO_FLAGS;
    const attentionReasons = (getAttentionReasons ? getAttentionReasons(entry) : NO_REASONS).join('\n');
    const rowKey = buildExpandedInsightsKey(sectionKey, entry.repo, data.number ?? '');
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
        isExpanded={expandedInsights[rowKey] ?? false}
        isSelected={Boolean(selectedPrKey) && buildActivePrKey(data.number ?? '', rowRepo) === selectedPrKey}
        isFlagged={flags.isFlagged}
        isInReview={flags.isInReview}
        isAcknowledged={flags.isAcknowledged}
        attentionReasons={attentionReasons}
        isActive={activeKeys.has(activeKey)}
        isQueued={queuedKeys.has(activeKey)}
        columnCount={columns.length}
        {...handlers}
      />
    );
  };

  return (
    <table ref={tableRef} className="pr-table" aria-label={label || undefined} onKeyDown={handleKeyDown}>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} className={`pr-col-${column.key}`} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`pr-head-${column.key}`}
              // Its name stays "Actions" with the sort menu in it: a header's
              // name is read out with every cell of its column.
              aria-label={column.key === 'actions' && prs.length > 1 ? column.label : undefined}
            >
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
              ) : column.key === 'actions' && prs.length > 1 ? (
                // The section's sort, at the row's end: only where there's
                // an order to choose.
                <span className="pr-head-actions-content">
                  {orderChanged && onResort ? (
                    <button
                      type="button"
                      className="pr-head-resort"
                      data-tip="Order changed while you were working here - re-sort"
                      data-tip-on="hover"
                      onClick={onResort}
                    >
                      <span aria-hidden="true">Re-sort</span>
                      <span className="ui-visually-hidden">Order changed - re-sort {label || sectionKey}</span>
                    </button>
                  ) : (
                    column.label
                  )}
                  <PrSectionSortMenu sectionKey={sectionKey} sectionTitle={label || sectionKey} />
                </span>
              ) : (
                column.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      {groups.map(({ repo: groupRepo, rows }) =>
        groupRepo ? (
          // A body per repo, headed by it - so its rows don't each say it.
          <ShowRowRepoContext.Provider key={`group:${groupRepo}`} value={false}>
            <tbody className="pr-repo-group">
              <tr className="pr-repo-group-row">
                <th scope="rowgroup" colSpan={columns.length}>
                  {groupRepo}
                  <span className="pr-repo-group-count">
                    {rows.length} PR{rows.length === 1 ? '' : 's'}
                  </span>
                </th>
              </tr>
              {rows.map((entry) => renderRow(entry))}
            </tbody>
          </ShowRowRepoContext.Provider>
        ) : (
          <tbody key="rows">{rows.map((entry) => renderRow(entry))}</tbody>
        ),
      )}
    </table>
  );
}
