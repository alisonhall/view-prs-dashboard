/**
 * PrSection - a smart group or lifecycle section: a <details> whose
 * <summary> is the section header (icon, title, count), wrapping its PR
 * table. While collapsed, the header also summarises what's inside: how
 * many PRs need attention, have failing checks, have conflicts, or have
 * changed since your last ack.
 *
 * Named by its title (role "group"), and its table by the same title.
 *
 * Says when you start and stop working in it - the pointer over it or
 * focus in it (useSectionInteraction) - so a refresh doesn't re-sort its
 * rows meanwhile (useHeldSectionOrder).
 *
 * @module components/PrSection
 */

import { useEffect, useRef } from 'react';
import type { PrEntry } from '../types/pr-data.ts';
import { describeChecks, describeMergeable } from '../helpers/pr-row-signals.helpers.ts';
import { Icon, type IconName } from './ui/Icon';
import { BUILT_IN_SECTION_LOOKS } from '../helpers/pr-section-preferences.helpers.ts';
import { PrTable, type PrTableProps } from './PrTable';
import { useSectionInteraction } from '../state/useSectionInteraction';
import { usePrArchive } from '../state/PrArchiveContext';
import { archivedCount, type ArchivedSection } from '../helpers/pr-archive.helpers.ts';
import { Button } from './ui/Button';


export interface PrSectionData {
  key: string;
  title: string;
  // A custom section's icon and colour, or a smart group's chosen in
  // Settings › Appearance; otherwise the built-in look (BUILT_IN_SECTION_LOOKS).
  icon?: { icon: IconName; tone: string };
  prs: PrEntry[];
  totalCount?: number;
  isSmartGroup?: boolean;
  lifecycleSection?: string;
  dateHeader?: string;
  attentionCount?: number;
  defaultOpen?: boolean;
  // Its rows are held where they were while you work in it, and its sort
  // would now order them differently (useHeldSectionOrder).
  orderChanged?: boolean;
}

export interface PrSectionProps
  extends Omit<PrTableProps, 'prs' | 'sectionKey' | 'label' | 'isSmartGroup' | 'lifecycleSection' | 'orderChanged' | 'onResort'> {
  section: PrSectionData;
  isOpen: boolean;
  onToggleSection: (sectionKey: string, nextOpen?: boolean) => void;
  // You started or stopped working in the section (useSectionInteraction).
  onInteractingChange?: (sectionKey: string, interacting: boolean) => void;
  onResortSection?: (sectionKey: string) => void;
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

// The Closed and Merged sections' older PRs (past the archive cutoff),
// which the table goes without until you ask for them.
function ShowOlderPrs({ section }: { section: ArchivedSection }) {
  const { summary, status, shownSections, showSection } = usePrArchive();
  const count = archivedCount(summary, section);
  const shown = shownSections.has(section);
  if (count === 0 || (shown && status === 'loaded')) return null;
  const noun = section === 'merged' ? 'merged' : 'closed';
  if (shown && status === 'loading') {
    return <p className="pr-section-older" role="status">Loading older {noun} PRs…</p>;
  }
  if (shown && status === 'failed') {
    return (
      <div className="pr-section-older" role="alert">
        <span>Couldn't load the older {noun} PRs.</span>
        <Button onClick={() => showSection(section)}>Try again</Button>
      </div>
    );
  }
  return (
    <div className="pr-section-older">
      <Button icon="chevronDown" onClick={() => showSection(section)} hint="Merged and closed PRs past the archive cutoff, kept out of the table until asked for">
        Show older ({count})
      </Button>
    </div>
  );
}

export function PrSection({ section, isOpen, onToggleSection, onInteractingChange, onResortSection, ...tableProps }: PrSectionProps) {
  const { key, title, prs, totalCount, isSmartGroup, lifecycleSection, attentionCount = 0, orderChanged = false } = section;
  const interactionHandlers = useSectionInteraction(onInteractingChange && ((interacting) => onInteractingChange(key, interacting)));
  // `totalCount` is the full row count; fall back to the rendered rows.
  const displayedTotalCount = typeof totalCount === 'number' ? totalCount : prs.length;
  const sectionIcon = section.icon ?? BUILT_IN_SECTION_LOOKS[key];
  const summary = isOpen ? [] : summarise(prs, attentionCount);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const hasTable = prs.length > 0;
  // The table's column headers stick just below this section's own header,
  // and rows scrolled into view stop below both (pr-table.css), so their
  // heights go in --pr-section-header-height and --pr-table-head-height.
  // Exact, not rounded: a rounded height leaves a sliver for rows to show
  // through. Set directly, without a re-render.
  useEffect(() => {
    const details = detailsRef.current;
    const header = headerRef.current;
    if (!details || !header) return undefined;
    const tableHead = details.querySelector<HTMLElement>('.pr-table thead');
    const apply = () => {
      details.style.setProperty('--pr-section-header-height', `${header.getBoundingClientRect().height}px`);
      details.style.setProperty('--pr-table-head-height', `${tableHead ? tableHead.getBoundingClientRect().height : 0}px`);
    };
    apply();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    if (tableHead) observer.observe(tableHead);
    return () => observer.disconnect();
  }, [hasTable]);

  return (
    <details
      ref={detailsRef}
      className="pr-section"
      aria-label={title}
      data-pr-section={key}
      open={isOpen}
      {...interactionHandlers}
      onToggle={(event) => {
        const nextOpen = (event.target as HTMLDetailsElement).open;
        if (nextOpen !== isOpen) onToggleSection(key, nextOpen);
      }}
    >
      <summary ref={headerRef} className="pr-section-header">
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
        {hasTable ? (
          <PrTable
            {...tableProps}
            prs={prs}
            sectionKey={key}
            label={title}
            isSmartGroup={isSmartGroup}
            lifecycleSection={lifecycleSection}
            orderChanged={orderChanged}
            onResort={onResortSection && (() => onResortSection(key))}
          />
        ) : (
          <p className="pr-section-empty">No PRs in this section.</p>
        )}
        {!isSmartGroup && (key === 'merged' || key === 'closed') && <ShowOlderPrs section={key} />}
      </div>
    </details>
  );
}
