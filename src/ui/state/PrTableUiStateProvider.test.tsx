/** @jest-environment jsdom */

import { act, render } from '@testing-library/react';
import { PrTableUiStateProvider } from './PrTableUiStateProvider';
import {
  usePrTableOpenSections,
  usePrTableUiState,
  type PrTableOpenSectionsValue,
  type PrTableUiStateValue,
} from './PrTableUiStateContext';

// Separate probes, so each counts the renders of its own context's
// consumers.
const tableRenders: PrTableUiStateValue[] = [];
const openSectionsRenders: PrTableOpenSectionsValue[] = [];
function TableProbe() {
  tableRenders.push(usePrTableUiState());
  return null;
}
function OpenSectionsProbe() {
  openSectionsRenders.push(usePrTableOpenSections());
  return null;
}
const table = () => tableRenders[tableRenders.length - 1] as PrTableUiStateValue;
const openSections = () => openSectionsRenders[openSectionsRenders.length - 1] as PrTableOpenSectionsValue;

const renderProvider = () => {
  tableRenders.length = 0;
  openSectionsRenders.length = 0;
  render(
    <PrTableUiStateProvider>
      <TableProbe />
      <OpenSectionsProbe />
    </PrTableUiStateProvider>,
  );
};

const SECTIONS = [
  { key: 'in-review', defaultOpen: true, prNumbers: ['1'] },
  { key: 'needs-attention', defaultOpen: true, prNumbers: ['2', '1'] },
  { key: 'open', defaultOpen: false, prNumbers: ['3', '2', '1'] },
];

describe('PrTableUiStateProvider', () => {
  test('a section uses its default until the user opens or closes it', () => {
    renderProvider();
    expect(table().isSectionOpen('in-review', true)).toBe(true);
    expect(table().isSectionOpen('open', false)).toBe(false);

    act(() => table().setSectionOpen('in-review', false));
    act(() => table().setSectionOpen('open', true));
    expect(table().isSectionOpen('in-review', true)).toBe(false);
    expect(table().isSectionOpen('open', false)).toBe(true);
    expect(table().sectionOpenOverrides).toEqual({ 'in-review': false, open: true });
  });

  test('rows expand, collapse and toggle by composite key', () => {
    renderProvider();

    act(() => table().setRowExpanded('open:owner/repo:1', true));
    expect(table().expandedRows['open:owner/repo:1']).toBe(true);

    act(() => table().toggleRowExpanded('open:owner/repo:1'));
    expect(table().expandedRows['open:owner/repo:1']).toBe(false);

    act(() => table().toggleRowExpanded('open:owner/repo:2'));
    expect(table().expandedRows['open:owner/repo:2']).toBe(true);
  });

  test("rows' details open, close and toggle by composite key, apart from their summary", () => {
    renderProvider();

    act(() => table().setRowDetailsOpen('open:owner/repo:1', true));
    expect(table().detailRows['open:owner/repo:1']).toBe(true);
    expect(table().expandedRows['open:owner/repo:1']).toBeUndefined();

    act(() => table().toggleRowDetails('open:owner/repo:1'));
    expect(table().detailRows['open:owner/repo:1']).toBe(false);

    act(() => table().toggleRowDetails('open:owner/repo:2'));
    expect(table().detailRows['open:owner/repo:2']).toBe(true);
  });

  test('holds the selected PR', () => {
    renderProvider();
    expect(table().selectedPr).toBeNull();

    act(() => table().setSelectedPr({ repo: 'owner/repo', prNumber: '412' }));
    expect(table().selectedPr).toEqual({ repo: 'owner/repo', prNumber: '412' });

    act(() => table().setSelectedPr(null));
    expect(table().selectedPr).toBeNull();
  });

  test('derives the open sections and their PR numbers from the reported sections', () => {
    renderProvider();
    act(() => table().reportRenderedSections(SECTIONS));
    expect(openSections().openSectionCount).toBe(2);
    expect(openSections().prNumbersInOpenSections).toEqual(['1', '2']);

    act(() => table().setSectionOpen('in-review', false));
    act(() => table().setSectionOpen('open', true));
    expect(openSections().openSectionCount).toBe(2);
    expect(openSections().prNumbersInOpenSections).toEqual(['2', '1', '3']);
  });

  test('a report of rendered sections re-renders only the open-sections consumers, not the table', () => {
    renderProvider();
    const tableCount = tableRenders.length;
    const openSectionsCount = openSectionsRenders.length;

    act(() => table().reportRenderedSections(SECTIONS));

    expect(tableRenders.length).toBe(tableCount);
    expect(openSectionsRenders.length).toBe(openSectionsCount + 1);
  });

  test('a report that changes a closed section keeps the same PR-number list, so open-sections consumers do not re-render', () => {
    renderProvider();
    act(() => table().reportRenderedSections(SECTIONS));
    const before = openSections().prNumbersInOpenSections;
    const openSectionsCount = openSectionsRenders.length;

    // A new PR in the closed "open" section: the open sections' PRs are the same.
    act(() =>
      table().reportRenderedSections([
        SECTIONS[0] as (typeof SECTIONS)[number],
        SECTIONS[1] as (typeof SECTIONS)[number],
        { key: 'open', defaultOpen: false, prNumbers: ['4', '3', '2', '1'] },
      ]),
    );

    expect(openSections().prNumbersInOpenSections).toBe(before);
    expect(openSectionsRenders.length).toBe(openSectionsCount);
  });

  test('an unchanged report, or setting a state it already has, re-renders nobody', () => {
    renderProvider();
    act(() => table().reportRenderedSections([{ key: 'open', defaultOpen: false, prNumbers: ['3'] }]));
    act(() => table().setSectionOpen('open', true));
    act(() => table().setRowExpanded('open:owner/repo:3', true));
    act(() => table().setRowDetailsOpen('open:owner/repo:3', true));
    const tableCount = tableRenders.length;
    const openSectionsCount = openSectionsRenders.length;

    act(() => table().reportRenderedSections([{ key: 'open', defaultOpen: false, prNumbers: ['3'] }]));
    act(() => table().setSectionOpen('open', true));
    act(() => table().setRowExpanded('open:owner/repo:3', true));
    act(() => table().setRowDetailsOpen('open:owner/repo:3', true));
    expect(tableRenders.length).toBe(tableCount);
    expect(openSectionsRenders.length).toBe(openSectionsCount);
  });
});
