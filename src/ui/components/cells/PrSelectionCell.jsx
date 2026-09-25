/**
 * PrSelectionCell - Bulk-select checkbox cell, used by the Export feature.
 * Matches vanilla's row-select-cell (helpers/pr-selection-cell.helpers.js).
 *
 * @module components/cells/PrSelectionCell
 */


export function PrSelectionCell({ pr }) {
  const getSelectedPrNumbers = window.getSelectedPrNumbers || (() => []);
  const updateSelectedPrNumbers = window.updateSelectedPrNumbers || (() => {});

  const prNumber = String(pr?.number || '').trim();

  return (
    <td className="row-select-cell">
      <input
        type="checkbox"
        className="row-select-checkbox"
        defaultChecked={getSelectedPrNumbers().includes(prNumber)}
        data-pr-number={prNumber}
        title={prNumber ? `Select PR #${prNumber}` : 'Select PR'}
        onChange={(e) => updateSelectedPrNumbers(prNumber, e.target.checked)}
      />
    </td>
  );
}
