/**
 * LinesChangedInsight - "N files changed, +A additions, -D deletions (T
 * lines changed)" value. Matches vanilla's createLinesChangedInsightContent
 * (helpers/pr-lines-changed-insight.helpers.js).
 *
 * @module components/insights/LinesChangedInsight
 */

import type { PrData } from '../../types/pr-data.ts';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';

const { toCount } = createPrFormattingHelpers();

export function LinesChangedInsight({ pr }: { pr: PrData }) {
  const rawAdditions = String(pr?.additions ?? '').trim();
  const rawDeletions = String(pr?.deletions ?? '').trim();
  if (rawAdditions === '' || rawDeletions === '') {
    return <>-</>;
  }

  const additionsCount = toCount(rawAdditions);
  const deletionsCount = toCount(rawDeletions);
  const totalLinesChanged = additionsCount + deletionsCount;
  const changedFilesCount = toCount(pr?.changedFilesCount);
  const changedFilesLabel = `${changedFilesCount} file${changedFilesCount === 1 ? '' : 's'} changed`;

  return (
    <span className="insight-line-changes">
      <span className="insight-line-changes-files">{changedFilesLabel}</span>
      {', '}
      <span className="insight-line-changes-additions">+{additionsCount} additions</span>
      {', '}
      <span className="insight-line-changes-deletions">-{deletionsCount} deletions</span>
      {' ('}
      <span className="insight-line-changes-total">{totalLinesChanged} lines changed</span>
      {')'}
    </span>
  );
}
