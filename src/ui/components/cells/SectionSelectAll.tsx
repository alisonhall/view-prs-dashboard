/**
 * SectionSelectAll - the select column's header checkbox in a section's
 * table: ticks or unticks every row the section shows (its rows are
 * already filtered), through the same "PR number(s)" field the row
 * checkboxes use (PrSelectionCell). Ticked when all of them are selected,
 * a dash (indeterminate) when some are; a click with some or none selects
 * them all, and with all, clears them. PRs selected elsewhere stay as
 * they are.
 *
 * Subscribes to the field with a selector giving 'all' | 'some' | 'none',
 * so it re-renders only when that answer changes.
 *
 * @module components/cells/SectionSelectAll
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PrEntry } from '../../types/pr-data.ts';
import { useFilterFieldActions, useFilterFieldValue } from '../../state/FilterStateContext';
import { selectionStateOf, setSelectedPrNumbers } from '../../helpers/pr-selected-pr-numbers.helpers.ts';

const PR_NUMBERS_FIELD = 'prNumbersInput';

export function SectionSelectAll({ prs, sectionLabel }: { prs: readonly PrEntry[]; sectionLabel: string }) {
  const prNumbers = useMemo(
    () => Array.from(new Set(prs.map((entry) => String(entry?.data?.number ?? entry?.prNumber ?? '').trim()).filter(Boolean))),
    [prs],
  );
  const { getFieldValue, setFieldValue } = useFilterFieldActions();
  const selectState = useCallback((input: unknown) => selectionStateOf(input, prNumbers), [prNumbers]);
  const state = useFilterFieldValue(PR_NUMBERS_FIELD, selectState);
  const inputRef = useRef<HTMLInputElement>(null);
  // Indeterminate is a property only, not an attribute; browsers say it
  // as "mixed" (so no aria-checked, which a native checkbox mustn't have).
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = state === 'some';
  }, [state]);

  const label = `Select all PRs in ${sectionLabel}`;
  return (
    <input
      ref={inputRef}
      type="checkbox"
      className="row-select-checkbox"
      checked={state === 'all'}
      title={state === 'all' ? `Deselect all PRs in ${sectionLabel}` : label}
      aria-label={label}
      disabled={prNumbers.length === 0}
      onChange={() =>
        setFieldValue(PR_NUMBERS_FIELD, setSelectedPrNumbers(String(getFieldValue(PR_NUMBERS_FIELD) || ''), prNumbers, state !== 'all'))
      }
    />
  );
}
