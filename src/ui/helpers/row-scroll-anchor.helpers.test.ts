/** @jest-environment jsdom */

import { captureRowAnchor, restoreRowAnchor } from './row-scroll-anchor.helpers';

// Rows whose on-screen tops a test sets (jsdom has no layout).
const tops = new Map<Element, number>();
const addRow = (top: number, attributes: Record<string, string> = {}) => {
  const row = document.createElement('tr');
  row.className = 'pr-row';
  Object.entries(attributes).forEach(([name, value]) => row.setAttribute(name, value));
  row.innerHTML = '<td><a class="pr-link" href="#">#1</a></td>';
  document.querySelector('tbody')?.appendChild(row);
  tops.set(row, top);
  return row;
};

describe('row scroll anchor', () => {
  beforeEach(() => {
    document.body.innerHTML = '<table><tbody></tbody></table>';
    tops.clear();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = tops.get(this) ?? tops.get(this.closest('tr') as Element) ?? 0;
      return { top, bottom: top + 40 } as DOMRect;
    });
    window.scrollBy = jest.fn() as unknown as typeof window.scrollBy;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps the preferred row (the clicked one) still when it's in view", () => {
    addRow(100);
    const clicked = addRow(500);
    const anchor = captureRowAnchor(clicked.querySelector('a'));
    expect(anchor?.element).toBe(clicked);

    tops.set(clicked, 650);
    restoreRowAnchor(anchor);
    expect(window.scrollBy).toHaveBeenCalledWith(0, 150);
  });

  test("without a preferred row in view, uses the selected row in view, then the first row in view", () => {
    addRow(-200);
    const firstInView = addRow(50);
    const selected = addRow(300, { 'aria-current': 'true' });
    expect(captureRowAnchor(document.body)?.element).toBe(selected);

    selected.removeAttribute('aria-current');
    expect(captureRowAnchor(null)?.element).toBe(firstInView);
  });

  test('a selected row scrolled out of view is passed over', () => {
    addRow(-300, { 'aria-current': 'true' });
    const firstInView = addRow(20);
    expect(captureRowAnchor(null)?.element).toBe(firstInView);
  });

  test("doesn't scroll when the row didn't move, or is gone", () => {
    const row = addRow(200);
    const anchor = captureRowAnchor(row);
    restoreRowAnchor(anchor);
    expect(window.scrollBy).not.toHaveBeenCalled();

    row.remove();
    tops.set(row, 900);
    restoreRowAnchor(anchor);
    expect(window.scrollBy).not.toHaveBeenCalled();
    restoreRowAnchor(null);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  test('with no row in view there is nothing to keep still', () => {
    addRow(-500);
    addRow(1200);
    expect(captureRowAnchor(null)).toBeNull();
  });
});
