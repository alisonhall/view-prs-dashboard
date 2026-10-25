import type { MouseEvent } from 'react';
import type { PrData } from '../../types/pr-data.ts';
import { useRepoLabels } from '../../state/RepoLabelsContext';
import { getLabelName } from '../../helpers/pr-filter-label-extraction.helpers.ts';
import { IconButton } from '../ui/Button';
import { MenuButton } from '../ui/MenuButton';

/**
 * The Actions column, as icon buttons with tooltips:
 * - In review and Flagged, as toggles (they were checkboxes)
 * - Update, and Ack (pressed once acknowledged; pressing again clears it)
 * - a More menu: View PR JSON details, and Add label (the repo's labels
 *   the PR doesn't have yet)
 *
 * Accessible names keep the PR number ("Update PR #2"), so each row's
 * controls can be told apart.
 */
type PrNumber = string | number | undefined;
type PrEntryRef = { prNumber: string; repo: string };

export interface PrActionsCellProps {
  pr: PrData;
  repo: string;
  isFlagged: boolean;
  isInReview: boolean;
  isAcknowledged: boolean;
  onCheckboxChange?: (prNumber: PrNumber, type: 'inReview' | 'flagged', checked: boolean, repo: string) => void;
  onAckAction?: (prNumber: PrNumber, isAcked: boolean, repo: string) => void;
  onApplyLabel?: (prNumber: PrNumber, label: string, repo: string) => void;
  onUpdatePr?: (prNumber: PrNumber, entry: PrEntryRef, pr: PrData) => unknown;
  onViewJson?: (entry: PrEntryRef, pr: PrData) => void;
}

export function PrActionsCell({
  pr,
  repo,
  isFlagged,
  isInReview,
  isAcknowledged,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
  onUpdatePr,
  onViewJson,
}: PrActionsCellProps) {
  const prNumber = String(pr?.number || '');
  const entry = { prNumber, repo };
  const { labels: repoLabels } = useRepoLabels();
  const existingLabels = new Set((Array.isArray(pr?.labels) ? pr.labels : []).map((label) => getLabelName(label)).filter(Boolean));
  const availableLabels = repoLabels
    .map((label) => String(label?.name || ''))
    .filter((name) => name && !existingLabels.has(name));

  // Rows sit inside clickable areas from phase 4 on; keep these clicks to
  // themselves.
  const handle = (action: () => unknown) => (event: MouseEvent) => {
    event.stopPropagation();
    void action();
  };

  return (
    <td className="pr-cell pr-cell-actions">
      <span className="pr-actions">
        <IconButton
          icon="eye"
          label={`In Review for PR #${prNumber}`}
          pressed={isInReview}
          onClick={handle(() => onCheckboxChange?.(pr?.number, 'inReview', !isInReview, repo))}
        />
        <IconButton
          icon="flag"
          tone="danger"
          label={`Flagged for PR #${prNumber}`}
          pressed={isFlagged}
          onClick={handle(() => onCheckboxChange?.(pr?.number, 'flagged', !isFlagged, repo))}
        />
        <IconButton icon="refresh" label={`Update PR #${prNumber}`} onClick={handle(() => onUpdatePr?.(pr?.number, entry, pr))} />
        <IconButton
          icon="check"
          label={`${isAcknowledged ? "Ack'd" : 'Ack'} PR #${prNumber}`}
          pressed={isAcknowledged}
          // onAckAction's `isAcked` means "is it acked now": it acks or
          // clears from that, so passing the current state flips it.
          onClick={handle(() => onAckAction?.(pr?.number, isAcknowledged, repo))}
        />
        <MenuButton
          icon="more"
          label={`More actions for PR #${prNumber}`}
          entries={[
            { id: 'json', label: 'View PR JSON details', icon: 'braces', onSelect: () => onViewJson?.(entry, pr) },
            {
              id: 'labels',
              label: 'Add label',
              emptyText: 'No labels to add',
              items: availableLabels.map((name) => ({
                id: name,
                label: name,
                onSelect: () => onApplyLabel?.(pr?.number, name, repo),
              })),
            },
          ]}
        />
      </span>
    </td>
  );
}
