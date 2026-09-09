/**
 * PrLabelsCell - Label chips. Matches vanilla's labels-cell
 * (helpers/pr-labels-cell.helpers.js), including its hash-based chip
 * coloring (label-chip-0..4).
 *
 * @module components/cells/PrLabelsCell
 */

import React from 'react';

export function PrLabelsCell({ pr }) {
  const getLabelName = window.getLabelName || ((label) => String(label?.name || label || '').trim());

  const labels = (Array.isArray(pr?.labels) ? pr.labels : []).map((label) => getLabelName(label)).filter(Boolean);

  if (!labels.length) {
    return <td className="labels-cell">-</td>;
  }

  return (
    <td className="labels-cell">
      {labels.map((label, index) => {
        const hash = [...label].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return (
          <span key={`${label}-${index}`} className={`label-chip label-chip-${hash % 5}`}>
            {label}
          </span>
        );
      })}
    </td>
  );
}
