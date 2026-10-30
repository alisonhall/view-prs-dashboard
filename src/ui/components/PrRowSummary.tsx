import type { ReactNode } from 'react';
import type { PrActivityEvent, PrData } from '../types/pr-data.ts';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import { ActorIdentity } from './ActorIdentity';
import { ActivityEventDescription } from './insights/ActivityEventDescription';
import { Button } from './ui/Button';
import { usePrInsightsDisplay } from '../state/PrInsightsDisplayContext';
import { useNow } from '../state/NowContext';
import { describeStatusLine, getSummaryThreads, toPlainLine } from '../helpers/pr-row-summary.helpers.ts';
import { formatShortAge } from '../helpers/pr-row-signals.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

const EVENT_LIMIT = 3;
const THREAD_LIMIT = 2;

/**
 * A row's inline summary, opened by its chevron (UI_REDESIGN_PLAN.md,
 * phase 3), in three columns of fixed height:
 * - Why it's here: the needs-attention reasons, then Flagged / In review
 *   (which put it in those groups), and a status line.
 * - Latest activity: the newest three events of the activity feed.
 * - Open conversations: the two most recently active unresolved threads.
 *
 * Each column is a labelled group, not a region: a region is a landmark,
 * and every open row would add three.
 *
 * "Show details" opens the PR in the detail pane (showing the pane if it
 * was hidden) - a keyboard way to pick a PR, besides ↑/↓ in the table.
 */
export interface PrRowSummaryProps {
  pr: PrData;
  attentionReasons: string[];
  isFlagged?: boolean;
  isInReview?: boolean;
  actorsMap?: ActorsMap;
  // Unique per row: the column headings' ids start with it.
  idPrefix: string;
  onShowDetails: () => void;
}

// A relative age ("3h"), with the full time on hover and for screen readers.
function Age({ value, now }: { value: string; now: number }) {
  const age = formatShortAge(value, now);
  if (!age) return null;
  const full = formatIsoDatetime(value);
  return (
    <time className="pr-summary-age" dateTime={value} data-tip={full} data-tip-on="hover">
      <span aria-hidden="true">{age}</span>
      <span className="ui-visually-hidden">{full}</span>
    </time>
  );
}

function Column({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <div className="pr-summary-column" role="group" aria-labelledby={id}>
      <h3 className="pr-summary-heading" id={id}>
        {heading}
      </h3>
      {children}
    </div>
  );
}

// A one-line text that may be cut off: in full on hover (and in the
// details). Only on the text itself, so names keep their own tooltips.
function Snippet({ text, prefix = '' }: { text: string; prefix?: string }) {
  if (!text) return null;
  return (
    <span className="pr-summary-snippet" data-tip={text} data-tip-on="hover">
      {prefix}
      {text}
    </span>
  );
}

const eventSnippet = (event: PrActivityEvent): string => toPlainLine(event?.body || event?.messageHeadline || '');

export function PrRowSummary({
  pr,
  attentionReasons,
  isFlagged = false,
  isInReview = false,
  actorsMap = {},
  idPrefix,
  onShowDetails,
}: PrRowSummaryProps) {
  const now = useNow();
  const { buildActivityEvents } = usePrInsightsDisplay();
  const prNumber = String(pr?.number ?? '');
  const events = buildActivityEvents(pr).slice(0, EVENT_LIMIT);
  const { threads, openCount } = getSummaryThreads(pr, THREAD_LIMIT);
  const moreThreads = openCount - threads.length;
  const markers = [isFlagged ? 'Flagged' : '', isInReview ? 'In review' : ''].filter(Boolean);

  return (
    <div className="pr-summary">
      <Column id={`${idPrefix}-why`} heading="Why it's here">
        {attentionReasons.length > 0 && (
          <ul className="pr-summary-list pr-summary-reasons">
            {attentionReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        )}
        {markers.length > 0 && (
          <ul className="pr-summary-list pr-summary-markers">
            {markers.map((marker) => (
              <li key={marker}>{marker}</li>
            ))}
          </ul>
        )}
        {attentionReasons.length === 0 && markers.length === 0 && (
          <p className="pr-summary-empty">Nothing needs your attention</p>
        )}
        <p className="pr-summary-status">{describeStatusLine(pr)}</p>
      </Column>

      <Column id={`${idPrefix}-activity`} heading="Latest activity">
        {events.length > 0 ? (
          <ul className="pr-summary-list">
            {events.map((event, index) => (
              <li key={`${event.sourceId || ''}-${index}`} className="pr-summary-item">
                <span className="pr-summary-text">
                  <ActivityEventDescription event={event} row={pr} actorsMap={actorsMap} />
                  <Snippet text={eventSnippet(event)} prefix=": " />
                </span>
                <Age value={String(event.occurredAt || '')} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="pr-summary-empty">No activity recorded</p>
        )}
      </Column>

      <Column id={`${idPrefix}-threads`} heading="Open conversations">
        {threads.length > 0 ? (
          <ul className="pr-summary-list">
            {threads.map((thread, index) => {
              const where = thread.file ? `${thread.file}${thread.line != null ? ` L${thread.line}` : ''}` : 'Conversation';
              return (
                <li key={`${thread.url}-${index}`} className="pr-summary-thread">
                  {/* The full path on hover; the link opens the thread on GitHub. */}
                  {thread.url ? (
                    <a className="pr-summary-file" href={thread.url} target="_blank" rel="noopener noreferrer" data-tip={thread.path || undefined}>
                      {where}
                    </a>
                  ) : (
                    <span className="pr-summary-file" data-tip={thread.path || undefined} data-tip-on="hover">
                      {where}
                    </span>
                  )}
                  <span className="pr-summary-text">
                    {thread.authorLogin && (
                      <ActorIdentity row={pr} login={thread.authorLogin} actorsMap={actorsMap} fallbackName={thread.authorName} />
                    )}
                    <Snippet text={thread.text} prefix={thread.authorLogin ? ': ' : ''} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pr-summary-empty">None open</p>
        )}
        {moreThreads > 0 && <p className="pr-summary-more">+{moreThreads} more open</p>}
      </Column>

      <div className="pr-summary-actions">
        <Button icon="panel" aria-label={`Show details for PR #${prNumber}`} onClick={onShowDetails}>
          Show details
        </Button>
      </div>
    </div>
  );
}
