/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FilterStateContext } from './FilterStateContext';
import { useTableArchiveSections } from './useTableArchiveSections';
import { FILTER_SEARCH_DEBOUNCE_MS } from './useVisiblePrNumbers';

// The filter fields' values, as FilterStateProvider gives them.
const renderWithFilters = (initial: Record<string, string>) => {
  let values = initial;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FilterStateContext.Provider value={{ values } as never}>{children}</FilterStateContext.Provider>
  );
  const view = renderHook(() => useTableArchiveSections(), { wrapper });
  return {
    result: view.result,
    setValues: (next: Record<string, string>) => {
      values = next;
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
});
