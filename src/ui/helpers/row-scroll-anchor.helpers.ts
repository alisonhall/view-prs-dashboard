// Keeps a PR row in the same place on screen across a layout change (the
// detail pane opening or closing narrows or widens the table, so rows
// change height): capture its position before, restore it after - the rest
// of the page reflows around it.
export interface RowAnchor {
  element: Element;
  top: number;
}

const ROW = 'tr.pr-row, tr.pr-summary-row';

const isInView = (element: Element) => {
  const { top, bottom } = element.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
};

// The row to keep still: `preferred`'s row (the one clicked, or holding
// focus) when it's a PR row in view, else the selected PR's row in view,
// else the first PR row in view. Null when no row is in view.
export const captureRowAnchor = (preferred?: Element | null, root: ParentNode = document): RowAnchor | null => {
  const preferredRow = preferred?.closest?.(ROW) ?? null;
  const element =
    (preferredRow && isInView(preferredRow) ? preferredRow : null) ||
    Array.from(root.querySelectorAll('tr.pr-row[aria-current="true"]')).find(isInView) ||
    Array.from(root.querySelectorAll('tr.pr-row')).find(isInView) ||
    null;
  return element ? { element, top: element.getBoundingClientRect().top } : null;
};

// Scrolls the window so the anchor's row is back where it was (when it's
// still on the page and moved).
export const restoreRowAnchor = (anchor: RowAnchor | null) => {
  if (!anchor || !anchor.element.isConnected) return;
  const shift = anchor.element.getBoundingClientRect().top - anchor.top;
  if (Math.abs(shift) >= 1) window.scrollBy(0, shift);
};
