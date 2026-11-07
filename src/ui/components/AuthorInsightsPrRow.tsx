/**
 * AuthorInsightsPrRow - one PR in the Authors view's lists (the author's
 * PRs, and the PRs with notes about them), in two lines:
 *
 * - its state (open, draft, closed or merged, the icon the table's smart
 *   groups use), `#N title` linking to GitHub, and when it was merged,
 *   closed or last updated;
 * - the table's signals, as one keyboard stop with their tooltips: the
 *   script's status (changed, no recent activity...), approvals, checks,
 *   open conversations and viewed files, then `View in table`, which shows
 *   it in the Pull requests view (useNavigateToPrInTable, which remembers
 *   this button for the table's Back to Authors).
 *
 * @module components/AuthorInsightsPrRow
 */

import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { useNavigateToPrInTable } from '../state/useNavigateToPrInTable';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.ts';
import { getAuthorPrState } from '../helpers/author-picker.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { describeChecks, describeViewedFiles } from '../helpers/pr-row-signals.helpers.ts';
import type { PrEntry } from '../types/pr-data.ts';
import { LIFECYCLE_SIGNALS } from './cells/PrTitleCell';
import { EmptySignal, Signal, SignalGroup, type SignalProps } from './ui/Signal';

const { formatIsoDatetime, toCount } = createPrFormattingHelpers();

type SlotSignal = Omit<SignalProps, 'inGroup'> | null;

// The script's status, as the table's Signals column shows it.
const describeStatus = (status: string): SlotSignal => {
  if (status.startsWith('CHANGED')) return { icon: 'dot', tone: 'accent', label: `Status: ${status}` };
  if (status === 'NO_ACTIVITY') return { icon: 'ring', tone: 'muted', label: 'No recent activity' };
  if (status && status !== '-' && status !== 'NO_CHANGE') return { icon: 'info', tone: 'muted', label: `Status: ${status}` };
  return null;
};

export function AuthorInsightsPrRow({ entry }: { entry: PrEntry | null | undefined }) {
  const navigateToPrInTable = useNavigateToPrInTable();
  const { getOpenConversationCount } = useAuthorInsights();
  const row = entry?.data || {};
  const prNumber = String(row.number || entry?.prNumber || '').trim();
  const href = row.url || `https://github.com/${entry?.repo || DEFAULT_REPO}/pull/${prNumber}`;
  const title = String(row.title || row.titleDisplay || '').trim();

  const state = getAuthorPrState(entry);
  const lifecycle = LIFECYCLE_SIGNALS[state === 'open' && entry?.section === 'draft' ? 'draft' : state];
  const [dateWord, date] =
    state === 'merged' ? ['Merged', row.mergedAt] : state === 'closed' && row.closedAt ? ['Closed', row.closedAt] : ['Updated', row.sourceUpdatedAt];

  const approved = String(row.approved || '').toUpperCase() === 'YES';
  const approvalCount = toCount(row.approvalCount);
  const approvalsLabel = `Approved: ${approved ? 'YES' : 'NO'} · ${approvalCount} approval${approvalCount === 1 ? '' : 's'}`;
  const checks = describeChecks(row);
  const conversationCount = getOpenConversationCount(row);
  const viewedFiles = describeViewedFiles(row);
  const slots: SlotSignal[] = [
    describeStatus(String(row.status || '').trim().toUpperCase()),
    { icon: 'approve', tone: approved ? 'success' : 'muted', text: String(approvalCount), label: approvalsLabel, size: 14 },
    checks ? { icon: checks.icon, tone: checks.tone, label: checks.label } : null,
    conversationCount > 0
      ? {
          icon: 'chat',
          tone: 'attention',
          text: String(conversationCount),
          label: `${conversationCount} open conversation${conversationCount === 1 ? '' : 's'}`,
          size: 14,
        }
      : null,
    viewedFiles ? { icon: 'fileViewed', tone: viewedFiles.tone, text: viewedFiles.text, label: viewedFiles.label, size: 14 } : null,
  ];

  return (
    <div className="author-pr-row">
      <div className="author-pr-row-line">
        {lifecycle && <Signal icon={lifecycle.icon} tone={lifecycle.tone} label={lifecycle.label} />}
        <a className="author-pr-row-title" href={href} target="_blank" rel="noopener noreferrer">
          #{prNumber} {title}
        </a>
        {date && (
          <span className="author-pr-row-date">
            {dateWord} {formatIsoDatetime(date)}
          </span>
        )}
      </div>
      <div className="author-pr-row-line">
        <SignalGroup label="Signals" className="pr-signal-slots" summary={slots.flatMap((slot) => (slot ? [slot.label] : []))}>
          {/* Slots keep their place whether filled or not, as in the table. */}
          {slots.map((slot, index) => (slot ? <Signal key={index} {...slot} inGroup /> : <EmptySignal key={index} />))}
        </SignalGroup>
        <button
          type="button"
          className="ui-link-button author-pr-row-view"
          onClick={(event) => navigateToPrInTable(prNumber, { repo: entry?.repo, from: event.currentTarget })}
        >
          View in table
        </button>
      </div>
    </div>
  );
}
