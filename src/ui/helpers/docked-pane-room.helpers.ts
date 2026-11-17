// The docked detail pane sticks near the window's top while the PR list
// scrolls, but only within the list's height: near the end of the list a
// full-height pane is pushed up, and its header (with close and
// previous/next) goes above the window. So it shrinks to the room left
// between where it sticks and the list's bottom, its contents scrolling
// inside it.
export interface DockedPaneRoomInput {
  // The list's box and where the pane sticks, relative to the window.
  listTop: number;
  listBottom: number;
  stickyTop: number;
  // The pane's height when nothing limits it (its CSS max-height).
  paneMaxHeight: number;
}

// Shorter than this, the pane is too small to use; it's pushed up instead.
export const MIN_DOCKED_PANE_HEIGHT = 240;

// The most the pane may be tall, in px; null when that's no less than its
// usual height - mid-list, or a list no taller than the pane (the pane
// sets the workspace's height then, so it's never pushed).
export const dockedPaneRoom = ({ listTop, listBottom, stickyTop, paneMaxHeight }: DockedPaneRoomInput): number | null => {
  if (listBottom - listTop <= paneMaxHeight) return null;
  const room = listBottom - Math.max(stickyTop, listTop);
  if (room >= paneMaxHeight) return null;
  return Math.max(MIN_DOCKED_PANE_HEIGHT, Math.floor(room));
};
