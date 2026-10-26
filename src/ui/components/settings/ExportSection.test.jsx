/** @jest-environment jsdom */

const { render, screen, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { ExportSection } = require('./ExportSection');
const { PrDataProvider } = require('../../state/PrDataProvider');
const { PrTableOpenSectionsContext } = require('../../state/PrTableUiStateContext');

// The PRs Export treats as visible (those in the table's open sections)
// come from PrTableOpenSectionsContext; `uiState` overrides it per test.
// The default is one open section showing PR 11, matching samplePayload.
const buildTree = ({ initialPayload, selectedRepo, uiState } = {}) => (
  <PrDataProvider initialPayload={initialPayload} initialSelectedRepo={selectedRepo}>
    <PrTableOpenSectionsContext.Provider value={{ prNumbersInOpenSections: ['11'], openSectionCount: 1, ...uiState }}>
      <ExportSection />
    </PrTableOpenSectionsContext.Provider>
  </PrDataProvider>
);
const renderExportSection = (options) => render(buildTree(options));

// No `repo` field on the entry itself (deliberately) - getPerPrUserStateFromPayload
// always contributes 4 fixed userStatePaths (ackByRepo/inReviewByRepo/
// notesByPrNumber/reverifyByRepo) regardless of entry content, and
// buildExportPayload's own repo resolution already falls back to
// payload.lastRun.repo - so omitting it here keeps the catalog's *data*
// side down to just the 2 fields this test cares about (prNumber/title),
// for a total of 6 real checkboxes (confirmed by running the real
// getFieldCatalog against this fixture).
const samplePayload = {
  byPrNumber: {
    11: { prNumber: 11, title: 'PR 11' },
  },
  lastRun: { repo: 'owner/repo', updatedAt: '2026-06-16T10:00:00Z' },
};

const twoPrPayload = {
  byPrNumber: {
    11: { prNumber: 11, title: 'PR 11' },
    12: { prNumber: 12, title: 'PR 12' },
  },
  lastRun: { repo: 'owner/repo', updatedAt: '2026-06-16T10:00:00Z' },
};

describe('ExportSection', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (String(url) === '/view-prs/user-defaults' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ overrides: {} }) });
      }
      if (String(url) === '/view-prs/user-defaults' && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const waitForAllFieldsSelected = () =>
    waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });

  test('given PRs in open and closed sections, when exporting, then only the open sections\' PRs are included', async () => {
    const user = userEvent.setup();
    renderExportSection({
      initialPayload: twoPrPayload,
      selectedRepo: 'owner/repo',
      uiState: { prNumbersInOpenSections: ['12'], openSectionCount: 1 },
    });
    await waitForAllFieldsSelected();

    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => expect(screen.getByText('Prepared export JSON for 1 visible PR.')).toBeInTheDocument());
    const preview = screen.getByRole('region', { name: 'Export preview' });
    expect(preview).toHaveTextContent('"prNumber": "12"');
    expect(preview).not.toHaveTextContent('"prNumber": "11"');
  });

  test('given no open sections, when exporting, then no PRs are included', async () => {
    const user = userEvent.setup();
    renderExportSection({
      initialPayload: twoPrPayload,
      selectedRepo: 'owner/repo',
      uiState: { prNumbersInOpenSections: [], openSectionCount: 0 },
    });
    await waitForAllFieldsSelected();

    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => expect(screen.getByText('Prepared export JSON for 0 visible PRs.')).toBeInTheDocument());
  });

  test('given the table\'s open sections change, when the tab re-renders, then its summary updates without a click', () => {
    const { rerender } = renderExportSection({
      initialPayload: twoPrPayload,
      selectedRepo: 'owner/repo',
      uiState: { prNumbersInOpenSections: ['11'], openSectionCount: 1 },
    });
    expect(screen.getByText(/Visible PR rows eligible for export: 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Expanded PR sections: 1/)).toBeInTheDocument();

    rerender(
      buildTree({
        initialPayload: twoPrPayload,
        selectedRepo: 'owner/repo',
        uiState: { prNumbersInOpenSections: ['11', '12'], openSectionCount: 3 },
      }),
    );
    expect(screen.getByText(/Visible PR rows eligible for export: 2\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Expanded PR sections: 3/)).toBeInTheDocument();
  });

  // Accessibility naming: the field list, status and preview are findable by
  // role and name (e2e uses these instead of ids/classes).
  test('given the tab, when rendered, then the field list, status and preview are named', async () => {
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => expect(screen.getByRole('group', { name: 'Export fields' })).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Export status' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Export preview' })).toBeInTheDocument();
  });

  test('given a populated field catalog, when rendered, then it lists data and user-state checkboxes, all selected by default', async () => {
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
  });

  test('given no exportable fields, when rendered, then it shows the empty-state message', () => {
    renderExportSection({ initialPayload: {}, selectedRepo: '' });

    expect(screen.getByText('No exportable fields found in current payload.')).toBeInTheDocument();
  });

  test('given saved user-defaults overrides, when the catalog first loads, then only the saved fields are checked', async () => {
    global.fetch = jest.fn((url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (String(url) === '/view-prs/user-defaults' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            overrides: {
              'export-data-fields': ['prNumber'],
              'export-user-state-fields': [],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /prNumber/ })).toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: /^DATA title$/ })).not.toBeChecked();
  });

  test('given the user clicks "Select none" then "Data only", when selecting, then only data checkboxes end up checked', async () => {
    const user = userEvent.setup();
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });

    await user.click(screen.getByRole('button', { name: 'Select none' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Data only' }));
    expect(screen.getByRole('checkbox', { name: /prNumber/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^DATA title$/ })).toBeChecked();
  });

  test('given fields are selected, when Preview JSON is clicked, then the selection is persisted and the preview is rendered', async () => {
    const user = userEvent.setup();
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });

    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => {
      expect(screen.getByText('Prepared export JSON for 1 visible PR.')).toBeInTheDocument();
    });

    const putCall = global.fetch.mock.calls.find(
      ([url, init]) => String(url) === '/view-prs/user-defaults' && String(init?.method).toUpperCase() === 'PUT',
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall[1].body);
    expect(body['export-data-fields'].sort()).toEqual(['prNumber', 'title']);
    expect(body['export-user-state-fields'].sort()).toEqual([
      'ackByRepo',
      'inReviewByRepo',
      'notesByPrNumber',
      'reverifyByRepo',
    ]);

    expect(screen.getByText(/"prNumber": "11"/)).toBeInTheDocument();
  });

  test('given no fields are selected, when Preview JSON is clicked, then a validation error is shown instead of building JSON', async () => {
    const user = userEvent.setup();
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => {
      expect(screen.getByText('Select at least one field before exporting.')).toBeInTheDocument();
    });
  });

  test('given a browser with clipboard support, when Copy JSON is clicked, then the export JSON is written to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
    await user.click(screen.getByRole('button', { name: 'Copy JSON' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
      expect(screen.getByText('Copied export JSON for 1 visible PR.')).toBeInTheDocument();
    });
  });

  test('given a browser with download support, when Download JSON is clicked, then a blob is created, downloaded, and revoked', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock-url');
    const revokeObjectURL = jest.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;
    const clickedAnchors = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function mockClick() {
      clickedAnchors.push(this);
    };

    const user = userEvent.setup();
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
    await user.click(screen.getByRole('button', { name: 'Download JSON' }));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
      expect(clickedAnchors.length).toBeGreaterThan(0);
      expect(clickedAnchors[0].download).toMatch(/view-prs-export-owner-repo.*\.json/);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    HTMLAnchorElement.prototype.click = originalClick;
  });
});
