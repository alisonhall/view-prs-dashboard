/**
 * PrSelectionCell - Bulk-select checkbox cell, used by the Export feature.
 * Matches vanilla's row-select-cell (helpers/pr-selection-cell.helpers.js).
 *
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the "#pr-numbers" field it reads/
 * writes is now Context-backed (FilterStateProvider, via
 * ContextRunScriptTextInput.jsx) instead of a plain vanilla DOM input, so
 * this cell reads/writes the same `prNumbersInput` Context key too -
 * non-reactively, via window.getFilterStateValues()/setFilterStateValue()
 * (the same generic bridge index.page.js's own vanilla code already uses
 * to read/write this Context without its own React tree), rather than
 * useFilterState(). This cell mounts once per visible table row - a real
 * Context subscription here would re-render every row's checkbox on every
 * keystroke in ANY of the 30+ other filter fields, not just this one.
 * `defaultChecked` (not `checked`) preserves that same one-way,
 * initial-value-only behavior deliberately - zero behavior change from
 * the window.getSelectedPrNumbers/updateSelectedPrNumbers bridge this
 * replaces.
 *
 * @module components/cells/PrSelectionCell
 */

import { getSelectedPrNumbersFromInput, toggleSelectedPrNumber } from '../../helpers/pr-selected-pr-numbers.helpers.js';

export function PrSelectionCell({ pr }) {
  const prNumber = String(pr?.number || '').trim();
  const currentPrNumbersInput = () => window.getFilterStateValues?.()?.prNumbersInput || '';

  return (
    <td className="row-select-cell">
      <input
        type="checkbox"
        className="row-select-checkbox"
        defaultChecked={getSelectedPrNumbersFromInput(currentPrNumbersInput()).includes(prNumber)}
        data-pr-number={prNumber}
        title={prNumber ? `Select PR #${prNumber}` : 'Select PR'}
        onChange={(e) =>
          window.setFilterStateValue?.(
            'prNumbersInput',
            toggleSelectedPrNumber(currentPrNumbersInput(), prNumber, e.target.checked),
          )
        }
      />
    </td>
  );
}
