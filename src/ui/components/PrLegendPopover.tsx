import { useId, type ReactNode } from 'react';
import { Button, IconButton } from './ui/Button';
import { Icon, type IconName } from './ui/Icon';
import { useHeaderPopover } from './shell/useHeaderPopover';

type Tone = 'success' | 'danger' | 'attention' | 'accent' | 'pending' | 'muted';

interface LegendEntry {
  // An icon as the table draws it - with a name for screen readers, which
  // don't get the icon - or a text sample of a cue.
  icon?: IconName;
  tone?: Tone;
  name?: string;
  sample?: ReactNode;
  meaning: string;
}

interface LegendGroup {
  title: string;
  entries: LegendEntry[];
}

// What the PR table's icons and cues mean, column by column. Each cell's
// own tooltip gives the details for its PR; this says what to look for.
const LEGEND: LegendGroup[] = [
  {
    title: 'Signals',
    entries: [
      { icon: 'dot', tone: 'accent', name: 'Blue dot', meaning: 'Changed since your last Ack - its tooltip says since when and counts what\'s new (commits, reviews, comments).' },
      { icon: 'ring', tone: 'muted', name: 'Grey ring', meaning: 'No recent activity.' },
      { sample: '(blank)', meaning: 'An empty first slot: nothing new since your last Ack.' },
      { icon: 'info', tone: 'muted', name: 'Info icon', meaning: 'Another status - hover to see which.' },
      { icon: 'alert', tone: 'attention', name: 'Warning icon', meaning: 'Needs attention - hover for why (Settings › Attention rules decides).' },
      { icon: 'flag', tone: 'danger', name: 'Flag', meaning: 'Flagged by you.' },
      { icon: 'eye', tone: 'accent', name: 'Eye', meaning: 'In review: you marked it as one you’re reviewing.' },
    ],
  },
  {
    title: 'Pull request',
    entries: [
      { icon: 'refresh', tone: 'pending', name: 'Circular arrow', meaning: 'Being updated now.' },
      { icon: 'checksPending', tone: 'muted', name: 'Grey clock', meaning: 'Queued for an update.' },
      { icon: 'pr', tone: 'success', name: 'Green PR icon', meaning: 'Open (shown in sections that mix states, like Flagged).' },
      { icon: 'prDraft', tone: 'muted', name: 'Grey draft PR icon', meaning: 'Draft.' },
      { icon: 'merge', tone: 'accent', name: 'Blue merge icon', meaning: 'Merged.' },
      { icon: 'prClosed', tone: 'danger', name: 'Red closed PR icon', meaning: 'Closed without merging.' },
      { sample: 'Details updating', meaning: 'GitHub has changes its details haven’t caught up with yet.' },
      { sample: 'No longer open', meaning: 'GitHub’s list of open PRs doesn’t have it any more.' },
    ],
  },
  {
    title: 'Review',
    entries: [
      { icon: 'approve', tone: 'success', name: 'Person with a tick', meaning: 'Approvals - green once it’s approved.' },
      { icon: 'chat', tone: 'attention', name: 'Speech bubble', meaning: 'Open conversations you’re in.' },
      { icon: 'chatFilled', tone: 'attention', name: 'Filled speech bubble', meaning: 'Open conversations, at least one waiting on you.' },
      { icon: 'fileViewed', tone: 'success', name: 'File icon', meaning: 'Files you’ve viewed of those changed - green when you’ve viewed them all.' },
      { icon: 'note', tone: 'muted', name: 'Note icon', meaning: 'You’ve written notes.' },
      { sample: '2 to check', meaning: 'Conversations you started that someone else resolved - confirm them in the Conversations tab.' },
    ],
  },
  {
    title: 'CHK·MRG (checks and mergeability)',
    entries: [
      { icon: 'checksPass', tone: 'success', name: 'Green tick', meaning: 'All checks passed.' },
      { icon: 'checksFail', tone: 'danger', name: 'Red cross', meaning: 'At least one check failed.' },
      { icon: 'checksPending', tone: 'pending', name: 'Amber clock', meaning: 'Checks still running.' },
      { icon: 'checksSkipped', tone: 'muted', name: 'Grey crossed-out circle', meaning: 'Checks skipped.' },
      { icon: 'merge', tone: 'success', name: 'Green merge icon', meaning: 'Mergeable: no conflicts.' },
      { icon: 'mergeConflict', tone: 'attention', name: 'Conflict icon', meaning: 'Has conflicts.' },
      { icon: 'mergeUnknown', tone: 'muted', name: 'Grey question mark', meaning: 'GitHub hasn’t worked out whether it can merge yet.' },
    ],
  },
  {
    title: 'Activity',
    entries: [
      { sample: '3h', meaning: 'How long since the author’s last activity, and under it your own.' },
      { sample: <span className="pr-legend-stale">3h</span>, meaning: 'Dotted: not confirmed recently, so it may be out of date.' },
      { sample: <span className="pr-legend-behind">3h</span>, meaning: 'Dimmed: its details are behind GitHub.' },
    ],
  },
];

/**
 * The PR table's legend: a button above the table opening what its icons
 * and cues mean, column by column (LEGEND). A popover like the header's
 * (useHeaderPopover); its content mounts only while open.
 */
export function PrLegendPopover() {
  const titleId = useId();
  const panelId = useId();
  const { isOpen, open, close, buttonRef, panelRef, panelStyle } = useHeaderPopover();

  return (
    <>
      <Button
        ref={buttonRef}
        icon="info"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => (isOpen ? close(false) : open())}
      >
        Legend
      </Button>
      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          className="activity-popover pr-legend-popover"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={panelStyle}
        >
          <div className="activity-popover-header">
            <h2 id={titleId} className="activity-popover-title">
              What the icons mean
            </h2>
            <IconButton icon="close" label="Close legend" tooltipPlacement="bottom" onClick={() => close(true)} />
          </div>
          <div className="activity-popover-content pr-legend-content">
            {LEGEND.map((group) => (
              <section key={group.title} className="pr-legend-group" aria-label={group.title}>
                <h3 className="settings-heading">{group.title}</h3>
                <dl className="pr-legend-list">
                  {group.entries.map((entry) => (
                    <div key={entry.meaning} className="pr-legend-entry">
                      <dt className="pr-legend-mark">
                        {entry.icon ? (
                          <span className="ui-signal" data-tone={entry.tone}>
                            <Icon name={entry.icon} size={14} />
                            <span className="ui-visually-hidden">{entry.name}</span>
                          </span>
                        ) : (
                          <span className="pr-legend-sample">{entry.sample}</span>
                        )}
                      </dt>
                      <dd>{entry.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
