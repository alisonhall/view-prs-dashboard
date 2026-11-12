/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { PrDataContext, usePrData, type PrDataValue } from './PrDataContext';
import { PrArchiveProvider, WithArchivedRows } from './PrArchiveContext';
import { PrSection, type PrSectionProps } from '../components/PrSection';

// The table's props: none needed for a section with no rows.
const tableProps = {} as unknown as Omit<PrSectionProps, 'section' | 'isOpen' | 'onToggleSection'>;
import type { ArchiveSummary, PrDataPayload, PrEntry } from '../types/pr-data';

const row = (number: string, section: PrEntry['section']): PrEntry => ({
  prNumber: number,
  repo: 'o/r',
  section,
  data: { number, title: `PR ${number}` },
});

const archivedRows = {
  'o/r#501': { ...row('501', 'merged'), archived: true },
  'o/r#502': { ...row('502', 'closed'), archived: true },
};

const answer = (body: unknown, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

let setSummary: (summary: ArchiveSummary) => void = () => {};

// PrDataProvider's value, with a payload whose archiveSummary a test can change.
function FakePrData({ summary, children }: { summary: ArchiveSummary; children: ReactNode }) {
  const [archiveSummary, setArchiveSummary] = useState(summary);
  setSummary = setArchiveSummary;
  const payload: PrDataPayload = { byPrNumber: { 'o/r#1': row('1', 'open') }, archiveSummary };
  const value = {
    payload,
    selectedRepo: '',
    selectedAuthorLogin: '',
    statsViewState: {},
    hasRenderedPrData: true,
    setPayload: jest.fn(),
    applyFreshTablePayload: jest.fn(),
    setStatsViewState: jest.fn(),
    setSelectedAuthorLogin: jest.fn(),
    pollForDataChanges: jest.fn(),
    pollBackfillStatus: jest.fn(),
  } as unknown as PrDataValue;
  return <PrDataContext.Provider value={value}>{children}</PrDataContext.Provider>;
}

function RowKeys() {
  const { payload } = usePrData();
  return <p data-testid="keys">{Object.keys(payload.byPrNumber || {}).sort().join(',')}</p>;
}

const renderWith = (children: ReactNode, summary: ArchiveSummary = { version: 'v1', merged: 1, closed: 1 }) =>
  render(
    <FakePrData summary={summary}>
      <PrArchiveProvider>{children}</PrArchiveProvider>
    </FakePrData>,
  );

describe('PrArchiveContext', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(() => answer({ ok: true, byPrNumber: archivedRows }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test("given a view that doesn't include them, then nothing is fetched and its rows are the payload's", () => {
    renderWith(
      <WithArchivedRows include={false}>
        <RowKeys />
      </WithArchivedRows>,
    );
    expect(screen.getByTestId('keys').textContent).toBe('o/r#1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('given a view that includes them, then they are fetched once and its rows have them', async () => {
    const view = renderWith(
      <WithArchivedRows include>
        <RowKeys />
      </WithArchivedRows>,
    );
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('o/r#1,o/r#501,o/r#502'));
    expect(fetchMock).toHaveBeenCalledWith('/view-prs/archive', expect.anything());
    view.rerender(
      <FakePrData summary={{ version: 'v1', merged: 1, closed: 1 }}>
        <PrArchiveProvider>
          <WithArchivedRows include>
            <RowKeys />
          </WithArchivedRows>
        </PrArchiveProvider>
      </FakePrData>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("given sections, then only those sections' archived rows are added", async () => {
    renderWith(
      <WithArchivedRows include sections={new Set(['closed'])}>
        <RowKeys />
      </WithArchivedRows>,
    );
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('o/r#1,o/r#502'));
  });

  test('given nothing archived, then nothing is fetched', () => {
    renderWith(
      <WithArchivedRows include>
        <RowKeys />
      </WithArchivedRows>,
      { version: 'v1', merged: 0, closed: 0 },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('given a view shown before anything was counted, when archived PRs are counted, then they are fetched for it', async () => {
    renderWith(
      <WithArchivedRows include>
        <RowKeys />
      </WithArchivedRows>,
      {},
    );
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => setSummary({ version: 'v1', merged: 1, closed: 1 }));
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('o/r#1,o/r#501,o/r#502'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('given they were fetched, when their version moves, then they are fetched again', async () => {
    renderWith(
      <WithArchivedRows include>
        <RowKeys />
      </WithArchivedRows>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockImplementation(() => answer({ ok: true, byPrNumber: { 'o/r#503': { ...row('503', 'merged'), archived: true } } }));
    act(() => setSummary({ version: 'v2', merged: 1, closed: 0 }));
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('o/r#1,o/r#503'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("given the fetch fails, then it isn't tried again on its own, and Try again fetches them", async () => {
    fetchMock.mockImplementation(() => answer({ ok: false, error: 'down' }, false, 500));
    const section = { key: 'merged', title: 'Merged', prs: [], totalCount: 0, isSmartGroup: false, lifecycleSection: 'merged' };
    renderWith(
      <WithArchivedRows include>
        <PrSection section={section} isOpen onToggleSection={() => {}} {...tableProps} />
      </WithArchivedRows>,
    );
    expect(await screen.findByRole('button', { name: /Show older \(1\)/ })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Show older/ }));
    expect(await screen.findByText(/Couldn't load the older merged PRs/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementation(() => answer({ ok: true, byPrNumber: archivedRows }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/Couldn't load/)).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("PrSection's Show older", () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => answer({ ok: true, byPrNumber: archivedRows })) as unknown as typeof fetch;
  });

  const sectionOf = (key: string, isSmartGroup = false) => ({ key, title: key, prs: [], totalCount: 0, isSmartGroup, lifecycleSection: key });

  test('given archived PRs, then Closed and Merged offer them, with their counts, and other sections and smart groups do not', () => {
    renderWith(
      <>
        <PrSection section={sectionOf('merged')} isOpen onToggleSection={() => {}} {...tableProps} />
        <PrSection section={sectionOf('closed')} isOpen onToggleSection={() => {}} {...tableProps} />
        <PrSection section={sectionOf('open')} isOpen onToggleSection={() => {}} {...tableProps} />
        <PrSection section={sectionOf('recently-merged', true)} isOpen onToggleSection={() => {}} {...tableProps} />
      </>,
      { version: 'v1', merged: 4, closed: 2 },
    );
    expect(screen.getAllByRole('button', { name: /Show older/ }).map((button) => button.textContent)).toEqual(['Show older (4)', 'Show older (2)']);
  });

  test('given Show older is pressed, then it shows that it is loading, and goes once they are here', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    global.fetch = jest.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })) as unknown as typeof fetch;
    renderWith(<PrSection section={sectionOf('merged')} isOpen onToggleSection={() => {}} {...tableProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show older (1)' }));
    expect(screen.getByRole('status').textContent).toBe('Loading older merged PRs…');
    await act(async () => resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, byPrNumber: archivedRows }) } as Response));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('button', { name: /Show older/ })).toBeNull();
  });
});
