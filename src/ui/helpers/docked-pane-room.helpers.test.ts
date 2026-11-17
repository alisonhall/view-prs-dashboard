import { dockedPaneRoom, MIN_DOCKED_PANE_HEIGHT } from './docked-pane-room.helpers';

describe('dockedPaneRoom', () => {
  const paneMaxHeight = 676;

  test('a list no taller than the pane sets no limit', () => {
    expect(dockedPaneRoom({ listTop: 100, listBottom: 776, stickyTop: 12, paneMaxHeight })).toBeNull();
  });

  test('a list a little shorter than the window but taller than the pane is limited at its end', () => {
    // 690px of list in a 700px window: scrolled to the end, the pane would
    // be pushed up 66px.
    expect(dockedPaneRoom({ listTop: -68, listBottom: 622, stickyTop: 12, paneMaxHeight })).toBe(610);
  });

  test('partway down a long list, no limit (nothing to write while scrolling)', () => {
    expect(dockedPaneRoom({ listTop: -400, listBottom: 1240, stickyTop: 12, paneMaxHeight })).toBeNull();
  });

  test("near the list's end, the room stops at the list's bottom", () => {
    expect(dockedPaneRoom({ listTop: -1000, listBottom: 608, stickyTop: 12, paneMaxHeight })).toBe(596);
  });

  test("before the pane sticks, it's measured from the list's top", () => {
    expect(dockedPaneRoom({ listTop: 150, listBottom: 700, stickyTop: 12, paneMaxHeight: 500 })).toBeNull();
    expect(dockedPaneRoom({ listTop: 150, listBottom: 600, stickyTop: 12, paneMaxHeight: 400 })).toBeNull();
  });

  test('whole pixels, so a fraction of a scroll changes nothing', () => {
    expect(dockedPaneRoom({ listTop: -1000, listBottom: 608.6, stickyTop: 12, paneMaxHeight })).toBe(596);
  });

  test('never shrinks below the minimum', () => {
    expect(dockedPaneRoom({ listTop: -2000, listBottom: 100, stickyTop: 12, paneMaxHeight })).toBe(MIN_DOCKED_PANE_HEIGHT);
  });
});
