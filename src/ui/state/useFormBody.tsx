import { useCallback } from 'react';
import { useFilterState } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { parsePrNumbersInput } from '../helpers/form-parsing.helpers.ts';

const checkedList = <L extends string>(checkedByListId: Partial<Record<L, Set<string>>>, listId: L): string[] =>
  Array.from(checkedByListId[listId] || []);

/**
 * Returns a function that builds the Run Script request body from the Run &
 * Filter form's state: FilterStateContext for the scalar fields and
 * RowFilterSelectionContext for the label/exclude-label/author lists.
 * Used by useRunScript/useAckLabelActions/useQuickCheckActions, which need
 * a <FilterStateProvider>/<RowFilterSelectionProvider> ancestor (both wrap
 * <AppRoot/> in mountAppRoot(), react-app.jsx).
 */
export interface FormBody {
  repo: string;
  prNumbersInput: string;
  prNumberList: string[];
  // prNumberList joined with ","; prNumber is its first entry.
  prNumbers: string;
  prNumber: string;
  limit: string;
  mergedLimit: string;
  jobs: string;
  openMode: string;
  // The selected labels/excluded labels/authors, joined with ", ".
  label: string;
  excludeLabel: string;
  author: string;
  ackChanged: boolean;
  showReason: boolean;
  quiet: boolean;
}

export function useFormBody(): () => FormBody {
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
