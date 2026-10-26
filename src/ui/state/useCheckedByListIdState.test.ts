/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { useCheckedByListIdState } from './useCheckedByListIdState';

const setup = () => renderHook(() => useCheckedByListIdState<'a' | 'b'>());

describe('useCheckedByListIdState', () => {
  test('setChecked replaces a list; toggle flips one value', () => {
    const { result } = setup();
    act(() => result.current.setChecked('a', ['x', 'y']));
    expect(Array.from(result.current.checkedByListId.a ?? [])).toEqual(['x', 'y']);
    act(() => result.current.toggle('a', 'x'));
    expect(Array.from(result.current.checkedByListId.a ?? [])).toEqual(['y']);
    // Anything but an array clears it.
    act(() => result.current.setChecked('a', null));
    expect(result.current.checkedByListId.a?.size).toBe(0);
  });

  test('setting the same values (in any order) keeps the same value object, so nothing re-renders or re-saves', () => {
    const { result } = setup();
    act(() => result.current.setChecked('a', ['x', 'y']));
    const before = result.current;
    act(() => result.current.setChecked('a', ['y', 'x']));
    expect(result.current).toBe(before);

    act(() => result.current.setChecked('a', ['x']));
    expect(result.current).not.toBe(before);
  });

  test('a list set for the first time, even empty, is a change', () => {
    const { result } = setup();
    const before = result.current;
    act(() => result.current.setChecked('b', []));
    expect(result.current).not.toBe(before);
    expect(result.current.checkedByListId.b?.size).toBe(0);
  });
});
