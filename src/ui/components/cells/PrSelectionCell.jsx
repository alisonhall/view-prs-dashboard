/**
 * PrSelectionCell - Bulk-select checkbox cell, used by the Export feature.
 * Matches vanilla's row-select-cell (helpers/pr-selection-cell.helpers.js).
 *
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the "#pr-numbers" field it reads/
 * writes is Context-backed (FilterStateProvider, via
 * ContextRunScriptTextInput.jsx), under the `prNumbersInput` key.
 *
 * Window-bridge elimination Phase 5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * this cell used to reach that key non-reactively through
 * window.getFilterStateValues()/setFilterStateValue(), because it mounts once
 * per visible table row and `useFilterState()` has no selector - a real
 * subscription would have re-rendered every row's checkbox on every keystroke
 * in ANY of the 30+ other filter fields. It now subscribes through
 * `useFilterFieldValue` (a per-key `useSyncExternalStore`, see
 * state/filterValuesStore.jsx) with a selector that returns just THIS row's
 * boolean, so a row re-renders only when its own "is selected" answer flips:
 * never for other fields, and not for edits to the PR-numbers field that
 * leave this PR's membership alone.
 *
 * That also makes the checkbox genuinely controlled (`checked`, not
 * `defaultChecked`). The old one-way, initial-value-only behavior was a
 * workaround for not being able to subscribe, and had a real gap: typing PR
 * numbers into the Run tab's "PR number(s)" field never updated the row
 * checkboxes.
 *
 * @module components/cells/PrSelectionCell
 */

import { useFilterFieldActions, useFilterFieldValue } from '../../state/FilterStateContext';
import { getSelectedPrNumbersFromInput, toggleSelectedPrNumber } from '../../helpers/pr-selected-pr-numbers.helpers.ts';

const PR_NUMBERS_FIELD = 'prNumbersInput';

export function PrSelectionCell({ pr }) {
  const prNumber = String(pr?.number || '').trim();
  const { getFieldValue, setFieldValue } = useFilterFieldActions();
  const isSelected = useFilterFieldValue(PR_NUMBERS_FIELD, (input) =>
    getSelectedPrNumbersFromInput(input).includes(prNumber),
  );

  return (
    <td className="row-select-cell">
      <input
        type="checkbox"
        className="row-select-checkbox"
        checked={isSelected}
        data-pr-number={prNumber}
        title={prNumber ? `Select PR #${prNumber}` : 'Select PR'}
        aria-label={prNumber ? `Select PR #${prNumber}` : 'Select PR'}
        onChange={(e) =>
          setFieldValue(
            PR_NUMBERS_FIELD,
            toggleSelectedPrNumber(getFieldValue(PR_NUMBERS_FIELD) || '', prNumber, e.target.checked),
          )
        }
      />
    </td>
  );
}
