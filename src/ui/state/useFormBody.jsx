import { useCallback } from 'react';
import { useFilterState } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { parsePrNumbersInput } from '../helpers/form-parsing.helpers.js';

const checkedList = (checkedByListId, listId) => Array.from(checkedByListId[listId] || []);

/**
 * Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 6): the reactive replacement for window.getFormBody
 * (index.page.js) - every field it read via FormData/DOM scan is already
 * Context-backed (FilterStateContext for the 9 scalar Run Script fields,
 * RowFilterSelectionContext for the 3 multi-selects also shared with
 * cluster 5's own, now-closed work), so this just re-derives the same
 * shape straight from Context instead of parsing a real <form> element.
 *
 * Needs a genuine `<FilterStateProvider>`/`<RowFilterSelectionProvider>`
 * ancestor - true for every real caller (useRunScript/useAckLabelActions/
 * useQuickCheckActions, all invoked from AppRoot's own body) now that both
 * Providers wrap <AppRoot/> itself (mountAppRoot(), react-app.jsx).
 *
 * `ackChanged`/`showReason`/`quiet` are already real booleans in Context -
 * window.getFormBody's own toBoolean(formProps.x) call (coercing a
 * FormData checkbox's "on"/absent string) is unnecessary here, not just a
 * 1:1 port.
 */
export function useFormBody() {
  const { values } = useFilterState();
  const { checkedByListId } = useRowFilterSelection();

  return useCallback(() => {
    const prNumbersInput = String(values.prNumbersInput || '').trim();
    const parsedPrNumbers = parsePrNumbersInput(prNumbersInput);
    const normalizedPrNumbers = parsedPrNumbers.join(',');

    return {
      repo: String(values.repo || '').trim(),
      prNumbersInput,
      prNumberList: parsedPrNumbers,
      prNumbers: normalizedPrNumbers,
      prNumber: parsedPrNumbers[0] || '',
      limit: String(values.limit || '').trim(),
      mergedLimit: String(values.mergedLimit || '').trim(),
      jobs: String(values.jobs || '').trim(),
      openMode: values.openMode || 'none',
      label: checkedList(checkedByListId, 'label-list').join(', '),
      excludeLabel: checkedList(checkedByListId, 'exclude-label-list').join(', '),
      author: checkedList(checkedByListId, 'author-list').join(', '),
      ackChanged: values.ackChanged === true,
      showReason: values.showReason === true,
      quiet: values.quiet === true,
    };
  }, [values, checkedByListId]);
}
