/**
 * PrDateCell - PR/viewer activity dates plus manual-notes field indicators.
 * Matches vanilla's date-cell (helpers/pr-date-cell.helpers.js).
 *
 * @module components/cells/PrDateCell
 */

import React from 'react';

function FieldIndicator({ hasData, title, text = '', extraClass = '' }) {
  const className = [
    'author-notes-field-indicator',
    hasData ? 'author-notes-field-indicator-filled' : 'author-notes-field-indicator-empty',
    extraClass,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} title={title}>
      {text}
    </span>
  );
}

export function PrDateCell({ entry, pr }) {
  const formatIsoDatetime = window.formatIsoDatetime || ((value) => String(value || '-'));
  const getManualNotesFieldSummary =
    window.getManualNotesFieldSummary ||
    (() => ({
      hasCustomComments: false,
      hasOtherNotes: false,
      hasDifficulty: false,
      difficultyLevelText: '',
      hasRallyStories: false,
      hasRallyLinks: false,
      hasAnalysisOfPr: false,
    }));

  const prLastActivity = pr?.mergedAt || pr?.closedAt || pr?.sourceUpdatedAt || pr?.updatedAt || '-';
  const prActivityTitle = pr?.mergedAt ? 'Merged at' : pr?.closedAt ? 'Closed at' : 'Last commit';
  const fieldSummary = getManualNotesFieldSummary(entry, pr);

  return (
    <td className="date-cell date-cell-with-notes-indicators">
      <div className="date-cell-content">
        <div className="date-cell-pr-activity" title={prActivityTitle}>
          {formatIsoDatetime(prLastActivity)}
        </div>
        <div className="date-cell-viewer-activity" title="Your last activity on this PR">
          You: {formatIsoDatetime(pr?.baseline)}
        </div>
      </div>
      <div className="date-notes-indicator-row">
        <FieldIndicator hasData={fieldSummary.hasCustomComments} title="Custom comments" />
        <FieldIndicator hasData={fieldSummary.hasOtherNotes} title="Other notes" />
        <FieldIndicator
          hasData={fieldSummary.hasDifficulty}
          title={fieldSummary.hasDifficulty ? `PR difficulty${fieldSummary.difficultyLevelText ? `: ${fieldSummary.difficultyLevelText}` : ''}` : 'PR difficulty'}
          text={fieldSummary.hasDifficulty ? fieldSummary.difficultyLevelText : ''}
          extraClass="author-notes-field-indicator-difficulty"
        />
        <FieldIndicator hasData={fieldSummary.hasRallyStories} title="Rally stories" />
        <FieldIndicator hasData={fieldSummary.hasRallyLinks} title="Rally links" />
        <FieldIndicator hasData={fieldSummary.hasAnalysisOfPr} title="Analysis of PR" />
      </div>
    </td>
  );
}
