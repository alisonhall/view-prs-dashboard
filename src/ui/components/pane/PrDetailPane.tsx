import { useRef, useState, type KeyboardEvent } from 'react';
import type { PrData, PrDataPayload, PrEntry } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import type { PaneTab } from '../../state/PrTableUiStateContext';
import { ActorIdentity } from '../ActorIdentity';
import { CopyIconButton } from '../CopyIconButton';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { MenuButton } from '../ui/MenuButton';
import { Tabs, TabPanel, type TabItem } from '../ui/Tabs';
import { useTooltipController } from '../ui/Tooltip';
import { ReviewThreadsSection } from '../insights/ReviewThreadsSection';
import { NotesSection } from '../insights/NotesSection';
import { InsightsHookContent, useInsightsHookHtml } from '../insights/InsightsHook';
import { PrOverview } from './PrOverview';
import { DEFAULT_ACTIVITY_FILTERS, PrActivityTab, type ActivityFilters } from './PrActivityTab';
import { getLastLookedAt } from '../../helpers/pr-activity-feed.helpers.ts';
import { useRepoLabels } from '../../state/RepoLabelsContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { useNotesDirty } from '../../state/NotesDirtyContext';
import { useFocusTrap } from '../../state/useFocusTrap';
import { getLabelName } from '../../helpers/pr-filter-label-extraction.helpers.ts';
import { createPrStatusDisplayHelpers } from '../../helpers/pr-status-display.helpers.ts';

const { formatTitleWithIcons } = createPrStatusDisplayHelpers();

type PrNumber = string | number | undefined;
type PrEntryRef = { prNumber: string; repo: string };

const TAB_ID_PREFIX = 'pr-pane';

/**
 * The detail pane (UI_REDESIGN_PLAN.md, phase 4): the selected PR, docked
 * beside the table, or below 900px an overlay drawer (a modal dialog with
 * a backdrop and trapped focus, closed with Esc or the backdrop).
 *
 * - Header: title and GitHub link, author, branch with a copy button,
 *   previous/next and close.
 * - Actions: Update, Ack, In review, Flagged, Add label, JSON - the row's
 *   actions, named without the PR number since the pane is about one PR.
 * - Tabs: Overview | Activity | Conversations | Notes, plus Custom insights
 *   only when the insights hook returned something for this PR. The tab
 *   stays as picked for the next PR (PrTableUiStateProvider's paneTab).
 *   Conversations shows how many are open; Notes is marked while unsaved.
 *
 * With no PR selected, the docked pane shows how to pick one.
 */
export interface PrDetailPaneProps {
  entry: PrEntry | null;
  repo: string;
  mode: 'docked' | 'drawer';
  actorsMap: ActorsMap;
  isFlagged: boolean;
  isInReview: boolean;
  isAcknowledged: boolean;
  // When the PR was last Ack'd (the user state), for "Since I last looked".
  ackedAt?: string;
  tab: PaneTab;
  onTabChange: (tab: PaneTab) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onCheckboxChange?: (prNumber: PrNumber, type: 'inReview' | 'flagged', checked: boolean, repo: string) => void;
  onAckAction?: (prNumber: PrNumber, isAcked: boolean, repo: string) => void;
  onApplyLabel?: (prNumber: PrNumber, label: string, repo: string) => void;
  onUpdatePr?: (prNumber: PrNumber, entry: PrEntryRef, pr: PrData) => unknown;
  onViewJson?: (entry: PrEntryRef, pr: PrData) => void;
  onDataRefresh?: (payload: PrDataPayload) => void;
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

function EmptyState() {
  return (
    <div className="pr-pane-empty">
      <span className="pr-pane-empty-icon" aria-hidden="true">
        <Icon name="panel" size={22} />
      </span>
      <p className="pr-pane-empty-title">No PR selected</p>
      <p className="pr-pane-empty-hint">Click a PR in the table, or use ↑/↓ there, to see its details here.</p>
    </div>
  );
}

export function PrDetailPane(props: PrDetailPaneProps) {
  const { entry, mode, onClose } = props;
  useTooltipController();
  const containerRef = useRef<HTMLElement>(null);
  // The Activity tab's filters, held here (not in the per-PR content) so
  // they stay as picked for the next PR.
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const isDrawer = mode === 'drawer';
  useFocusTrap(containerRef, isDrawer && Boolean(entry), onClose);

  // Esc in the docked pane clears the selection, except while typing.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (isDrawer || event.key !== 'Escape' || !entry || isEditable(event.target)) return;
    event.preventDefault();
    onClose();
  };

  const prNumber = String(entry?.data?.number ?? entry?.prNumber ?? '');
  const title = String(entry?.data?.title || '').trim();
  const pane = (
    <aside
      ref={containerRef}
      className="pr-pane"
      data-mode={mode}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer ? true : undefined}
      // Named by the PR alone, not the whole heading (its link text too).
      aria-label={entry ? `PR #${prNumber}${title ? `: ${title}` : ''}` : 'PR details'}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {entry ? (
        // Keyed by the PR: each PR gets fresh tab content, as each row's
        // insights used to. Notes and Conversations keep the user's edits
        // and choices in state set up when they mount; kept across a
        // switch, PR A's unsaved notes would show (and save) under PR B.
        <PaneContent
          key={`${entry.repo || props.repo}#${prNumber}`}
          {...props}
          entry={entry}
          prNumber={prNumber}
          activityFilters={activityFilters}
          onActivityFiltersChange={setActivityFilters}
        />
      ) : (
        <EmptyState />
      )}
    </aside>
  );

  if (!isDrawer) return pane;
  if (!entry) return null;
  return (
    <div className="pr-pane-overlay">
      <div className="pr-pane-backdrop" aria-hidden="true" onClick={onClose} />
      {pane}
    </div>
  );
}

function PaneContent({
  entry,
  prNumber,
  repo: fallbackRepo,
  actorsMap,
  isFlagged,
  isInReview,
  isAcknowledged,
  ackedAt,
  activityFilters,
  onActivityFiltersChange,
  tab,
  onTabChange,
  onPrevious,
  onNext,
  onClose,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
  onUpdatePr,
  onViewJson,
  onDataRefresh,
}: PrDetailPaneProps & {
  entry: PrEntry;
  prNumber: string;
  activityFilters: ActivityFilters;
  onActivityFiltersChange: (filters: ActivityFilters) => void;
}) {
  const pr = entry.data || {};
  const repo = entry.repo || fallbackRepo;
  const ref = { prNumber, repo };
  const url = pr.url || `https://github.com/${repo}/pull/${prNumber}`;
  const { labels: repoLabels } = useRepoLabels();
  const { buildRowActorsMap } = useActorIdentity();
  const { buildActivityEvents, getOpenConversationCountWithMe } = usePrInsightsDisplay();
  const { dirtyPrNumbers } = useNotesDirty();
  const hookHtml = useInsightsHookHtml(repo, prNumber, String(pr.sourceUpdatedAt || entry.updatedAt || ''));
  const rowActorsMap = buildRowActorsMap(pr, actorsMap);

  const existingLabels = new Set((Array.isArray(pr.labels) ? pr.labels : []).map((label) => getLabelName(label)).filter(Boolean));
  const availableLabels = repoLabels.map((label) => String(label?.name || '')).filter((name) => name && !existingLabels.has(name));
  const sourceBranch = String(pr.sourceBranch || '').trim();
  const targetBranch = String(pr.targetBranch || '').trim();
  // The same count as the row's Review cell: open conversations with the
  // viewer when they're known, so the badge says so.
  const conversations = getOpenConversationCountWithMe(pr);
  const openConversations = Number.parseInt(String(conversations?.count ?? ''), 10) || 0;
  const conversationsBadge = openConversations
    ? `${openConversations} ${conversations?.isViewerSpecific ? 'with you' : 'open'}`
    : undefined;
  // Every event, not the feed's first 60.
  const eventCount = buildActivityEvents(pr, Number.POSITIVE_INFINITY).length;
  const notesUnsaved = dirtyPrNumbers.includes(prNumber);

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity', badge: eventCount ? String(eventCount) : undefined },
    {
      id: 'conversations',
      label: 'Conversations',
      badge: conversationsBadge,
      badgeTone: 'attention',
    },
    { id: 'notes', label: 'Notes', badge: notesUnsaved ? 'unsaved' : undefined, badgeTone: 'attention' },
    ...(hookHtml ? [{ id: 'custom', label: 'Custom insights' }] : []),
  ];
  // The remembered tab may not exist for this PR (Custom insights).
  const selectedTab: PaneTab = tabs.some((item) => item.id === tab) ? tab : 'overview';

  return (
    <>
      <header className="pr-pane-header">
        <div className="pr-pane-nav">
          <IconButton icon="chevronUp" label="Previous PR" disabled={!onPrevious} onClick={() => onPrevious?.()} />
          <IconButton icon="chevronDown" label="Next PR" disabled={!onNext} onClick={() => onNext?.()} />
          <IconButton icon="close" label="Close details" className="pr-pane-close" onClick={onClose} />
        </div>
        <h2 className="pr-pane-title">
          {formatTitleWithIcons(pr.titleDisplay, pr.title)}{' '}
          <a className="pr-pane-link" href={url} target="_blank" rel="noopener noreferrer">
            #{prNumber}
            <Icon name="externalLink" size={12} label="opens GitHub in a new tab" />
          </a>
        </h2>
        <p className="pr-pane-meta">
          <span>
            by <ActorIdentity row={pr} login={pr.authorLogin} actorsMap={rowActorsMap} fallbackName={pr.author} />
          </span>
          {sourceBranch && (
            <span className="pr-pane-branch">
              <code>{sourceBranch}</code>
              <CopyIconButton text={sourceBranch} label="Copy branch name" />
              {targetBranch && (
                <>
                  {' → '}
                  <code>{targetBranch}</code>
                </>
              )}
            </span>
          )}
        </p>
      </header>

      <div className="pr-pane-actions" role="group" aria-label="Actions">
        <Button icon="refresh" onClick={() => void onUpdatePr?.(pr.number, ref, pr)}>
          Update
        </Button>
        <Button icon="check" pressed={isAcknowledged} onClick={() => onAckAction?.(pr.number, isAcknowledged, repo)}>
          {isAcknowledged ? "Ack'd" : 'Ack'}
        </Button>
        <Button icon="eye" pressed={isInReview} onClick={() => onCheckboxChange?.(pr.number, 'inReview', !isInReview, repo)}>
          In review
        </Button>
        <Button icon="flag" pressed={isFlagged} onClick={() => onCheckboxChange?.(pr.number, 'flagged', !isFlagged, repo)}>
          Flagged
        </Button>
        <MenuButton
          icon="tag"
          label="Add label"
          entries={[
            {
              id: 'labels',
              label: 'Labels',
              emptyText: 'No labels to add',
              items: availableLabels.map((name) => ({ id: name, label: name, onSelect: () => onApplyLabel?.(pr.number, name, repo) })),
            },
          ]}
        />
        <IconButton icon="braces" label="View PR JSON details" onClick={() => onViewJson?.(ref, pr)} />
      </div>

      <Tabs
        label={`PR #${prNumber} details`}
        idPrefix={TAB_ID_PREFIX}
        tabs={tabs}
        selectedId={selectedTab}
        onSelect={(id) => onTabChange(id as PaneTab)}
      />
      <TabPanel idPrefix={TAB_ID_PREFIX} tabId={selectedTab} className="pr-pane-panel">
        {selectedTab === 'overview' && <PrOverview entry={entry} pr={pr} actorsMap={rowActorsMap} />}
        {selectedTab === 'activity' && (
          <PrActivityTab
            pr={pr}
            actorsMap={rowActorsMap}
            lastLookedAt={getLastLookedAt(pr.baseline, ackedAt)}
            filters={activityFilters}
            onFiltersChange={onActivityFiltersChange}
          />
        )}
        {selectedTab === 'conversations' && <ConversationsTab pr={pr} actorsMap={rowActorsMap} />}
        {selectedTab === 'notes' && <NotesSection entry={entry} pr={pr} actorsMap={rowActorsMap} onDataRefresh={onDataRefresh} />}
        {selectedTab === 'custom' && hookHtml && <InsightsHookContent html={hookHtml} />}
      </TabPanel>
    </>
  );
}

// ReviewThreadsSection renders nothing for a PR with no conversations.
function ConversationsTab({ pr, actorsMap }: { pr: PrData; actorsMap: ActorsMap }) {
  const hasConversations =
    (Array.isArray(pr.reviewThreads) && pr.reviewThreads.length > 0) ||
    (Array.isArray(pr.comments) && pr.comments.length > 0) ||
    (Array.isArray(pr.reviews) && pr.reviews.some((review) => String(review?.body || '').trim()));
  if (!hasConversations) return <p className="pr-pane-none">No conversations</p>;
  return <ReviewThreadsSection pr={pr} actorsMap={actorsMap} defaultOpen />;
}
