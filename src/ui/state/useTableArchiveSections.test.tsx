/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ARCHIVED_ONLY_GROUP } from '../helpers/pr-archive.helpers';
import { FilterOptionsContext, type FilterOptionsValue } from './FilterOptionsContext';
import { FilterStateContext } from './FilterStateContext';
import { RowFilterSelectionContext } from './RowFilterSelectionContext';
import { useTableArchiveSections } from './useTableArchiveSections';
import { FILTER_SEARCH_DEBOUNCE_MS } from './useVisiblePrNumbers';

// The Author and Label lists as FilterOptionsProvider gives them: one of
// each only archived PRs have.
const OPTIONS = {
  authorOptions: [
    { value: 'current-dev', label: 'Current Dev', group: 'Everyone else' },
    { value: 'old-dev', label: 'Old Dev', group: ARCHIVED_ONLY_GROUP },
  ],
  labelOptions: [
    { value: 'bug', label: 'bug' },
    { value: 'Legacy', label: 'Legacy', group: ARCHIVED_ONLY_GROUP },
  ],
} as unknown as FilterOptionsValue;

// The filter fields' values, as FilterStateProvider gives them, and the
// lists' ticked options.
const renderWithFilters = (initial: Record<string, string>, initialChecked: Record<string, string[]> = {}) => {
  let values = initial;
  let checked = initialChecked;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FilterOptionsContext.Provider value={OPTIONS}>
      <RowFilterSelectionContext.Provider
        value={{ checkedByListId: Object.fromEntries(Object.entries(checked).map(([id, list]) => [id, new Set(list)])) } as never}
      >
        <FilterStateContext.Provider value={{ values } as never}>{children}</FilterStateContext.Provider>
      </RowFilterSelectionContext.Provider>
    </FilterOptionsContext.Provider>
  );
  const view = renderHook(() => useTableArchiveSections(), { wrapper });
  return {
    result: view.result,
    setValues: (next: Record<string, string>) => {
      values = next;
      view.rerender();
    },
    setChecked: (next: Record<string, string[]>) => {
      checked = next;
      view.rerender();
    },
  };
};

const sorted = (sections: ReadonlySet<string>) => [...sections].sort();

describe('useTableArchiveSections', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("given typing in the search, then the archived sections are added only once the table's debounce has passed, so the filter is there first", () => {
    const { result, setValues } = renderWithFilters({ filterSearch: '', filterPrNumbers: '' });
    expect(sorted(result.current)).toEqual([]);

    setValues({ filterSearch: 'p', filterPrNumbers: '' });
    expect(sorted(result.current)).toEqual([]);
    act(() => jest.advanceTimersByTime(FILTER_SEARCH_DEBOUNCE_MS - 1));
    expect(sorted(result.current)).toEqual([]);
    act(() => jest.advanceTimersByTime(1));
    expect(sorted(result.current)).toEqual(['closed', 'merged']);
  });

  test('given the search is cleared, then they go at once, before the table shows every row again', () => {
    const { result, setValues } = renderWithFilters({ filterSearch: 'parser', filterPrNumbers: '' });
    act(() => jest.advanceTimersByTime(FILTER_SEARCH_DEBOUNCE_MS));
    expect(sorted(result.current)).toEqual(['closed', 'merged']);

    setValues({ filterSearch: '', filterPrNumbers: '' });
    expect(sorted(result.current)).toEqual([]);
  });

  test('given PR numbers are entered, then they are added the same way', () => {
    const { result, setValues } = renderWithFilters({ filterSearch: '', filterPrNumbers: '' });
    setValues({ filterSearch: '', filterPrNumbers: '901' });
    expect(sorted(result.current)).toEqual([]);
    act(() => jest.advanceTimersByTime(FILTER_SEARCH_DEBOUNCE_MS));
    expect(sorted(result.current)).toEqual(['closed', 'merged']);
  });

  test('given an author only archived PRs have is ticked, then they are added at once, and go when it is unticked', () => {
    const empty = { filterSearch: '', filterPrNumbers: '' };
    const { result, setChecked } = renderWithFilters(empty, { 'author-list': ['current-dev'] });
    expect(sorted(result.current)).toEqual([]);

    setChecked({ 'author-list': ['current-dev', 'old-dev'] });
    expect(sorted(result.current)).toEqual(['closed', 'merged']);

    setChecked({ 'author-list': ['current-dev'] });
    expect(sorted(result.current)).toEqual([]);
  });

  test('given a label only archived PRs have is ticked, in another case, then they are added', () => {
    const { result } = renderWithFilters({ filterSearch: '', filterPrNumbers: '' }, { 'label-list': ['legacy'] });
    expect(sorted(result.current)).toEqual(['closed', 'merged']);
  });

  test('given one is ticked to exclude, then nothing is added: excluding needs no archived PRs', () => {
    const { result } = renderWithFilters({ filterSearch: '', filterPrNumbers: '' }, { 'exclude-label-list': ['Legacy'] });
    expect(sorted(result.current)).toEqual([]);
  });
});
