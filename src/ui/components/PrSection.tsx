/**
 * PrSection - a smart group or lifecycle section: a <details> whose
 * <summary> is the section header (icon, title, count), wrapping its PR
 * table. While collapsed, the header also summarises what's inside: how
 * many PRs need attention, have failing checks, have conflicts, or have
 * changed since your last ack.
 *
 * Named by its title (role "group"), and its table by the same title.
 *
 * @module components/PrSection
 */

import type { PrEntry } from '../types/pr-data.ts';
import { describeChecks, describeMergeable } from '../helpers/pr-row-signals.helpers.ts';
import { Icon, type IconName } from './ui/Icon';
import { PrTable, type PrTableProps } from './PrTable';

const SECTION_ICONS: Record<string, { icon: IconName; tone: string }> = {
  flagged: { icon: 'flag', tone: 'danger' },
  'in-review': { icon: 'eye', tone: 'accent' },
  'needs-attention': { icon: 'alert', tone: 'attention' },
  mine: { icon: 'pr', tone: 'accent' },
  'assigned-to-me': { icon: 'user', tone: 'accent' },
  'review-requested': { icon: 'approve', tone: 'attention' },
  interacted: { icon: 'users', tone: 'muted' },
  open: { icon: 'pr', tone: 'success' },
  draft: { icon: 'prDraft', tone: 'muted' },
  closed: { icon: 'prClosed', tone: 'danger' },
  merged: { icon: 'merge', tone: 'done' },
};

export interface PrSectionData {
  key: string;
  title: string;
  prs: PrEntry[];
  totalCount?: number;
  isSmartGroup?: boolean;
  lifecycleSection?: string;
  dateHeader?: string;
  attentionCount?: number;
  defaultOpen?: boolean;
}

export interface PrSectionProps extends Omit<PrTableProps, 'prs' | 'sectionKey' | 'label' | 'isSmartGroup' | 'lifecycleSection'> {
  section: PrSectionData;
  isOpen: boolean;
  onToggleSection: (sectionKey: string, nextOpen?: boolean) => void;
}

interface SummaryItem {
  key: string;
  icon: IconName;
  tone: string;
  count: number;
  label: string;
}

const summarise = (prs: PrEntry[], attentionCount: number): SummaryItem[] => {
  const count = (test: (entry: PrEntry) => boolean) => prs.filter(test).length;
  const failing = count((entry) => describeChecks(entry?.data)?.icon === 'checksFail');
  const conflicts = count((entry) => describeMergeable(entry?.data)?.icon === 'mergeConflict');
  const unread = count((entry) => String(entry?.data?.status || '').toUpperCase().startsWith('CHANGED'));
  const items: SummaryItem[] = [
    { key: 'attention', icon: 'alert', tone: 'attention', count: attentionCount, label: `${attentionCount} need${attentionCount === 1 ? 's' : ''} attention` },
    { key: 'failing', icon: 'checksFail', tone: 'danger', count: failing, label: `${failing} with failing checks` },
    { key: 'conflicts', icon: 'mergeConflict', tone: 'attention', count: conflicts, label: `${conflicts} with conflicts` },
    { key: 'unread', icon: 'dot', tone: 'accent', count: unread, label: `${unread} changed since your last ack` },
  ];
  return items.filter((item) => item.count > 0);
};

export function PrSection({ section, isOpen, onToggleSection, ...tableProps }: PrSectionProps) {
  const { key, title, prs, totalCount, isSmartGroup, lifecycleSection, attentionCount = 0 } = section;
  // `totalCount` is the full row count; fall back to the rendered rows.
  const displayedTotalCount = typeof totalCount === 'number' ? totalCount : prs.length;
  const sectionIcon = SECTION_ICONS[key];
  const summary = isOpen ? [] : summarise(prs, attentionCount);

  return (
    <details
      className="pr-section"
      aria-label={title}
      data-pr-section={key}
      open={isOpen}
      onToggle={(event) => {
        const nextOpen = (event.target as HTMLDetailsElement).open;
        if (nextOpen !== isOpen) onToggleSection(key, nextOpen);
      }}
    >
      <summary className="pr-section-header">
        <Icon name="chevronRight" size={14} className="pr-section-chevron" />
        {sectionIcon && (
          <span className="pr-section-icon" data-tone={sectionIcon.tone}>
            <Icon name={sectionIcon.icon} />
          </span>
        )}
        <span className="pr-section-title">{title}</span>
        <span
          className="pr-section-count"
          data-tone={key === 'needs-attention' && displayedTotalCount > 0 ? 'attention' : undefined}
          title="PRs in this section"
        >
          {displayedTotalCount}
        </span>
        {summary.length > 0 && (
          <span className="pr-section-summary">
            {summary.map((item) => (
              <span key={item.key} className="pr-section-summary-item" data-tone={item.tone} title={item.label}>
                <Icon name={item.icon} size={14} />
                <span aria-hidden="true">{item.count}</span>
                <span className="ui-visually-hidden">{item.label}</span>
              </span>
            ))}
          </span>
        )}
      </summary>

      <div className="pr-section-content">
        {prs.length > 0 ? (
          <PrTable
            {...tableProps}
            prs={prs}
            sectionKey={key}
            label={title}
            isSmartGroup={isSmartGroup}
            lifecycleSection={lifecycleSection}
          />
        ) : (
          <p className="pr-section-empty">No PRs in this section.</p>
        )}
      </div>
    </details>
  );
}
