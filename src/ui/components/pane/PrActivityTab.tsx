import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PrActivityEvent, PrData } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import { ActorIdentity } from '../ActorIdentity';
import { ActivityEventDescription } from '../insights/ActivityEventDescription';
import { ActivityTimelineSummary } from '../insights/ActivityTimelineSummary';
import { Button } from '../ui/Button';
import { Chip, ChipGroup } from '../ui/Chip';
import { Icon, type IconName } from '../ui/Icon';
import { useNow } from '../../state/NowContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';
import {
  ACTIVITY_KINDS,
  activityKindOf,
  buildActivityFeed,
  describeDay,
  formatTimeOfDay,
  type ActivityKind,
  type ActivityScope,
  type FeedItem,
} from '../../helpers/pr-activity-feed.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

/**
 * The detail pane's Activity tab (UI_REDESIGN_PLAN.md, phase 5):
 * - Scope chips: "Since I last looked" (your last activity or Ack,
 *   whichever is later) and "All"; without a last-looked time, only All.
 * - Event-type chips: Commits, Reviews, Comments, PR events, each with its
 *   count in the scope.
 * - The events grouped by day, newest first: who did what, when (the full
 *   time on hover), a GitHub link, and the comment or review text in full -
 *   long ones fold. One person's run of commits is one line that expands.
 * - In "All", a divider where the events you've already seen begin; in
 *   "Since I last looked", a button to show those earlier events.
 * - The daily summary table, collapsed, below.
 *
 * The filters stay as picked for the next PR (the pane holds them).
 */
export interface ActivityFilters {
  scope: ActivityScope;
  kinds: ActivityKind[];
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = { scope: 'since', kinds: [...ACTIVITY_KINDS] };

const KIND_META: Record<ActivityKind, { label: string; icon: IconName }> = {
  commit: { label: 'Commits', icon: 'commit' },
  review: { label: 'Reviews', icon: 'eye' },
  comment: { label: 'Comments', icon: 'chat' },
  event: { label: 'PR events', icon: 'pr' },
};

export interface PrActivityTabProps {
  pr: PrData;
  actorsMap?: ActorsMap;
  lastLookedAt: string;
  filters: ActivityFilters;
  onFiltersChange: (filters: ActivityFilters) => void;
  // Day headings and times use this zone; the browser's when omitted.
  timeZone?: string;
}

// A body longer than this, or with more lines, starts folded.
const FOLD_CHARACTERS = 400;
const FOLD_LINES = 6;

type Tone = 'success' | 'attention' | 'done' | 'danger' | 'muted';

const iconFor = (event: PrActivityEvent): { icon: IconName; tone: Tone } => {
  const type = String(event?.type || '');
  const state = String(event?.state || '').toUpperCase();
  if (type === 'approval' || state === 'APPROVED') return { icon: 'approve', tone: 'success' };
  if (state === 'CHANGES_REQUESTED') return { icon: 'alert', tone: 'attention' };
  if (type === 'merged') return { icon: 'merge', tone: 'done' };
  if (type === 'closed') return { icon: 'prClosed', tone: 'danger' };
  return { icon: KIND_META[activityKindOf(event)].icon, tone: 'muted' };
};

function Time({ value, timeZone }: { value: string | undefined; timeZone?: string }) {
  const short = formatTimeOfDay(value, timeZone);
  if (!short) return null;
  const full = formatIsoDatetime(String(value));
  return (
    <time className="pr-activity-time" dateTime={String(value)} data-tip={full} data-tip-on="hover">
      <span aria-hidden="true">{short}</span>
      <span className="ui-visually-hidden">{full}</span>
    </time>
  );
}

// The text in full: a comment or review as markdown, a commit message as
// plain text (it isn't markdown: "# Conflicts:" isn't a heading). A long
// one folds behind "Show more". Long means taller than the fold (FOLD_EMS,
// pane.css' max-height), measured when the text changes and whenever its
// width does (docked or drawer, a window resize); where nothing can be
// measured (no layout, e.g. jsdom), by its length.
const FOLD_EMS = 9;

function Body({ text, markdown }: { text: string; markdown: boolean }) {
  const { renderMarkdownAsHtml } = usePrInsightsDisplay();
  const textRef = useRef<HTMLDivElement>(null);
  // null until measured.
  const [overflows, setOverflows] = useState<boolean | null>(null);
  const long = overflows ?? (text.length > FOLD_CHARACTERS || text.split('\n').length > FOLD_LINES);
  const [open, setOpen] = useState(false);
  const folded = long && !open;

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return undefined;
    // scrollHeight is the whole text's height, folded or not.
    const measure = () => {
      const foldHeight = Number.parseFloat(window.getComputedStyle(element).fontSize) * FOLD_EMS;
      if (!(foldHeight > 0) || element.scrollHeight === 0) return;
      setOverflows(element.scrollHeight > foldHeight + 1);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="pr-activity-body">
      {markdown ? (
        <div
          ref={textRef}
          className="pr-activity-text"
          data-folded={folded ? 'true' : undefined}
          dangerouslySetInnerHTML={{ __html: renderMarkdownAsHtml(text) }}
        />
      ) : (
        <div ref={textRef} className="pr-activity-text pr-activity-plain" data-folded={folded ? 'true' : undefined}>
          {text}
        </div>
      )}
      {long && (
        <button type="button" className="pr-activity-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function EventItem({ event, pr, actorsMap, timeZone }: { event: PrActivityEvent; pr: PrData; actorsMap?: ActorsMap; timeZone?: string }) {
  const { normalizePrRootUrl } = usePrInsightsDisplay();
  const { icon, tone } = iconFor(event);
  const isCommit = activityKindOf(event) === 'commit';
  const body = String((isCommit ? event?.messageBody : event?.body) || '').trim();
  const headline = isCommit ? String(event?.messageHeadline || '').trim() : '';

  // A review's link to the PR itself says nothing more than the PR link;
  // other events without one of their own link to the PR.
  const directUrl = String(event?.url || '').trim();
  const prUrl = String(pr?.url || '').trim();
  const isReview = event?.channel === 'review';
  const directIsPrRoot = Boolean(directUrl) && normalizePrRootUrl(directUrl) === normalizePrRootUrl(prUrl) && !directUrl.includes('#');
  const linkUrl = directUrl ? (directIsPrRoot && isReview ? '' : directUrl) : isReview ? '' : prUrl;

  return (
    <li className="pr-activity-item" data-kind={activityKindOf(event)}>
      <span className="pr-activity-icon" data-tone={tone}>
        <Icon name={icon} size={14} />
      </span>
      <div className="pr-activity-main">
        <p className="pr-activity-line">
          <ActivityEventDescription event={event} row={pr} actorsMap={actorsMap} />
          {linkUrl && (
            <a className="pr-activity-link" href={linkUrl} target="_blank" rel="noopener noreferrer">
              View<span className="ui-visually-hidden"> on GitHub</span>
            </a>
          )}
        </p>
        {headline && (
          <p className="pr-activity-commit">
            {event?.sourceId && <code>{String(event.sourceId).slice(0, 7)}</code>} {headline}
          </p>
        )}
        {body && <Body text={body} markdown={!isCommit} />}
      </div>
      <Time value={event?.occurredAt} timeZone={timeZone} />
    </li>
  );
}

function CommitsItem({ actor, events, pr, actorsMap, timeZone }: { actor: string; events: PrActivityEvent[]; pr: PrData; actorsMap?: ActorsMap; timeZone?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="pr-activity-item" data-kind="commit">
      <span className="pr-activity-icon" data-tone="muted">
        <Icon name="commit" size={14} />
      </span>
      <div className="pr-activity-main">
        <button type="button" className="pr-activity-run" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          <ActorIdentity row={pr} login={actor} actorsMap={actorsMap} /> pushed {events.length} commits
        </button>
        {open && (
          <ul className="pr-activity-commits">
            {events.map((event, index) => (
              <li key={`${event.sourceId || ''}-${index}`}>
                {event?.sourceId && <code>{String(event.sourceId).slice(0, 7)}</code>} {String(event?.messageHeadline || '').trim()}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Time value={events[0]?.occurredAt} timeZone={timeZone} />
    </li>
  );
}

// A key from the item itself, not its position: what's expanded or
// unfolded stays with its event when a filter changes what's around it.
// A run of commits is keyed by its oldest, which a newer commit joining
// the run doesn't change. Repeats (one commit by two authors, say) get a
// counter.
const itemKeys = (items: FeedItem[]): string[] => {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const event = item.kind === 'event' ? item.event : item.kind === 'commits' ? item.events[item.events.length - 1] : undefined;
    const base =
      item.kind === 'marker'
        ? 'marker'
        : `${item.kind}:${event?.sourceId || ''}:${event?.occurredAt || ''}:${event?.actor || ''}:${event?.type || ''}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}#${count}` : base;
  });
};

function Item({ item, pr, actorsMap, timeZone }: { item: FeedItem; pr: PrData; actorsMap?: ActorsMap; timeZone?: string }) {
  if (item.kind === 'marker') {
    return (
      <li className="pr-activity-marker">
        <span>You last looked · {formatIsoDatetime(item.at)}</span>
      </li>
    );
  }
  if (item.kind === 'commits') {
    return <CommitsItem actor={item.actor} events={item.events} pr={pr} actorsMap={actorsMap} timeZone={timeZone} />;
  }
  return <EventItem event={item.event} pr={pr} actorsMap={actorsMap} timeZone={timeZone} />;
}

export function PrActivityTab({ pr, actorsMap, lastLookedAt, filters, onFiltersChange, timeZone }: PrActivityTabProps) {
  const now = useNow();
  const { buildActivityEvents } = usePrInsightsDisplay();
  // Built again only when the PR or the filters change, not on each minute
  // tick (useNow) or other re-render.
  const events = useMemo(() => buildActivityEvents(pr, Number.POSITIVE_INFINITY), [buildActivityEvents, pr]);
  const hasLastLooked = Boolean(lastLookedAt);
  const scope: ActivityScope = hasLastLooked ? filters.scope : 'all';
  const feed = useMemo(
    () => buildActivityFeed(events, { scope, lastLookedAt, kinds: filters.kinds, timeZone }),
    [events, scope, lastLookedAt, filters.kinds, timeZone],
  );
  const prNumber = String(pr?.number ?? '');
  // A closed PR's timeline stops at its close date (mergedAt wins, else
  // closedAt), not today.
  const isOpen = !String(pr.mergedAt || pr.closedAt || '').trim();

  const toggleKind = (kind: ActivityKind) =>
    onFiltersChange({
      ...filters,
      kinds: filters.kinds.includes(kind) ? filters.kinds.filter((value) => value !== kind) : [...filters.kinds, kind],
    });

  const emptyText =
    events.length === 0
      ? 'No activity recorded'
      : scope === 'since' && feed.sinceCount === 0
        ? 'Nothing new since you last looked'
        : 'No events match these filters';

  return (
    <div className="pr-activity">
      <div className="pr-activity-filters">
        {hasLastLooked && (
          <ChipGroup label="Scope">
            <Chip pressed={scope === 'since'} count={feed.sinceCount} onClick={() => onFiltersChange({ ...filters, scope: 'since' })}>
              Since I last looked
            </Chip>
            <Chip pressed={scope === 'all'} count={feed.totalCount} onClick={() => onFiltersChange({ ...filters, scope: 'all' })}>
              All
            </Chip>
          </ChipGroup>
        )}
        <ChipGroup label="Event types">
          {ACTIVITY_KINDS.map((kind) => (
            <Chip
              key={kind}
              icon={KIND_META[kind].icon}
              pressed={filters.kinds.includes(kind)}
              count={feed.kindCounts[kind]}
              onClick={() => toggleKind(kind)}
            >
              {KIND_META[kind].label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      {feed.shownCount === 0 ? (
        <p className="pr-pane-none">{emptyText}</p>
      ) : (
        feed.days.map((day) => {
          const headingId = `pr-activity-${prNumber}-${day.key || 'undated'}`;
          const keys = itemKeys(day.items);
          return (
            <div key={day.key || 'undated'} className="pr-activity-day" role="group" aria-labelledby={headingId}>
              <h3 className="pr-activity-day-heading" id={headingId}>
                {describeDay(day.key, now, timeZone)}
              </h3>
              <ol className="pr-activity-list">
                {day.items.map((item, index) => (
                  <Item key={keys[index]} item={item} pr={pr} actorsMap={actorsMap} timeZone={timeZone} />
                ))}
              </ol>
            </div>
          );
        })
      )}

      {feed.earlierCount > 0 && (
        <div className="pr-activity-earlier">
          <Button onClick={() => onFiltersChange({ ...filters, scope: 'all' })}>
            Show {feed.earlierCount} earlier event{feed.earlierCount === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      <details className="insight-section" data-insight-key="daily summary">
        <summary>Daily summary</summary>
        <ActivityTimelineSummary
          activityTimelineRaw={pr.activityTimeline}
          fallbackSummary={pr.activityTimelineSummary}
          isOpen={isOpen}
          pr={pr}
          actorsMap={actorsMap}
        />
      </details>
    </div>
  );
}
