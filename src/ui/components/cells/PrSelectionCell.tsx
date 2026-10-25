/**
 * PrSelectionCell - the row's bulk-select checkbox. It adds/removes the
 * PR in the Run tab's "PR number(s)" field (`prNumbersInput` in
 * FilterStateProvider), which the bulk actions and Quick check use.
 *
 * It subscribes through `useFilterFieldValue` (a per-key
 * `useSyncExternalStore`, see state/filterValuesStore.ts) with a selector
 * that returns just this row's boolean, so a row re-renders only when its
 * own "is selected" answer flips: never for other fields, and not for
 * edits to the PR-numbers field that leave this PR's membership alone. The
 * checkbox is controlled, so typing PR numbers into that field updates
 * the row checkboxes too.
 *
 * @module components/cells/PrSelectionCell
 */

import type { PrData } from '../../types/pr-data.ts';
import { useFilterFieldActions, useFilterFieldValue } from '../../state/FilterStateContext';
import { getSelectedPrNumbersFromInput, toggleSelectedPrNumber } from '../../helpers/pr-selected-pr-numbers.helpers.ts';

const PR_NUMBERS_FIELD = 'prNumbersInput';

export function PrSelectionCell({ pr }: { pr: PrData }) {
  const prNumber = String(pr?.number || '').trim();
  const { getFieldValue, setFieldValue } = useFilterFieldActions();
  const isSelected = useFilterFieldValue(PR_NUMBERS_FIELD, (input) =>
    getSelectedPrNumbersFromInput(input).includes(prNumber),
  );
  const label = prNumber ? `Select PR #${prNumber}` : 'Select PR';

  return (
    <td className="pr-cell pr-cell-select">
      <input
        type="checkbox"
        className="row-select-checkbox"
        checked={isSelected}
        data-pr-number={prNumber}
        title={label}
        aria-label={label}
        onChange={(event) =>
          setFieldValue(
            PR_NUMBERS_FIELD,
            toggleSelectedPrNumber(String(getFieldValue(PR_NUMBERS_FIELD) || ''), prNumber, event.target.checked),
          )
        }
      />
    </td>
  );
}
