/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { SECTION_INTERACTION_RELEASE_MS, useSectionInteraction } from './useSectionInteraction';

function Section({ onChange }: { onChange: (interacting: boolean) => void }) {
  const handlers = useSectionInteraction(onChange);
  return (
    <div data-testid="section" {...handlers}>
      <button type="button">Row</button>
    </div>
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useSectionInteraction', () => {
  test('in use as soon as the pointer comes in; free a moment after it leaves', () => {
    const onChange = jest.fn();
    render(<Section onChange={onChange} />);
    fireEvent.pointerEnter(screen.getByTestId('section'), { pointerType: 'mouse' });
    expect(onChange).toHaveBeenLastCalledWith(true);

    fireEvent.pointerLeave(screen.getByTestId('section'), { pointerType: 'mouse' });
    act(() => jest.advanceTimersByTime(SECTION_INTERACTION_RELEASE_MS - 1));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  test('coming back within the moment keeps it in use, and focus inside does too', () => {
    const onChange = jest.fn();
    render(<Section onChange={onChange} />);
    const section = screen.getByTestId('section');
    fireEvent.pointerEnter(section, { pointerType: 'mouse' });
    fireEvent.pointerLeave(section, { pointerType: 'mouse' });
    act(() => jest.advanceTimersByTime(500));
    fireEvent.pointerEnter(section, { pointerType: 'mouse' });
    act(() => screen.getByRole('button', { name: 'Row' }).focus());
    fireEvent.pointerLeave(section, { pointerType: 'mouse' });
    act(() => jest.advanceTimersByTime(SECTION_INTERACTION_RELEASE_MS * 2));
    expect(onChange.mock.calls).toEqual([[true]]);

    act(() => screen.getByRole('button', { name: 'Row' }).blur());
    act(() => jest.advanceTimersByTime(SECTION_INTERACTION_RELEASE_MS));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  test("focus left behind by a click (not the keyboard's) doesn't keep it in use", () => {
    const onChange = jest.fn();
    render(<Section onChange={onChange} />);
    // jsdom counts every focus as the keyboard's.
    const realMatches = Element.prototype.matches;
    const matches = jest.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':focus-visible' ? false : realMatches.call(this, selector);
    });
    try {
      fireEvent.pointerEnter(screen.getByTestId('section'), { pointerType: 'mouse' });
      act(() => screen.getByRole('button', { name: 'Row' }).focus());
      fireEvent.pointerLeave(screen.getByTestId('section'), { pointerType: 'mouse' });
      act(() => jest.advanceTimersByTime(SECTION_INTERACTION_RELEASE_MS));
      expect(onChange.mock.calls).toEqual([[true], [false]]);
    } finally {
      matches.mockRestore();
    }
  });

  test('free when the section goes', () => {
    const onChange = jest.fn();
    const { unmount } = render(<Section onChange={onChange} />);
    fireEvent.pointerEnter(screen.getByTestId('section'), { pointerType: 'mouse' });
    unmount();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
