/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { ExportTab } = require('./ExportTab');
const { PrDataProvider } = require('../state/PrDataProvider');

const renderExportTab = ({ initialPayload, selectedRepo } = {}) =>
  render(
    <PrDataProvider initialPayload={initialPayload} initialSelectedRepo={selectedRepo}>
      <ExportTab />
    </PrDataProvider>,
  );

const samplePayload = {
  byPrNumber: {
    11: { prNumber: 11, repo: 'owner/repo', title: 'PR 11' },
  },
  lastRun: { repo: 'owner/repo', updatedAt: '2026-06-16T10:00:00Z' },
};

describe('ExportTab', () => {
  beforeEach(() => {
    window.getExportFieldCatalog = jest.fn(() => ({
      dataPaths: ['prNumber', 'title'],
      userStatePaths: ['notesByPrNumber.otherNotes'],
    }));
    window.getVisiblePrNumbersFromSectionsHost = jest.fn(() => ['11']);
    window.buildExportPayload = jest.fn(({ visiblePrNumbers, selectedDataPaths, selectedUserStatePaths }) => ({
      prCount: visiblePrNumbers.length,
      prs: visiblePrNumbers.map((prNumber) => ({ prNumber })),
      selectedFields: { data: selectedDataPaths, userState: selectedUserStatePaths },
    }));
    window.safeJsonStringify = jest.fn((value) => JSON.stringify(value));

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
    delete window.getExportFieldCatalog;
    delete window.getVisiblePrNumbersFromSectionsHost;
    delete window.buildExportPayload;
    delete window.safeJsonStringify;
    jest.restoreAllMocks();
  });

  test('given a populated field catalog, when rendered, then it lists data and user-state checkboxes, all selected by default', async () => {
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
  });

  test('given no exportable fields, when rendered, then it shows the empty-state message', () => {
    window.getExportFieldCatalog = jest.fn(() => ({ dataPaths: [], userStatePaths: [] }));
    renderExportTab({ initialPayload: {}, selectedRepo: '' });

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

    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /prNumber/ })).toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: /^DATA title$/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /otherNotes/ })).not.toBeChecked();
  });

  test('given the user clicks "Select none" then "Data only", when selecting, then only data checkboxes end up checked', async () => {
    const user = userEvent.setup();
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });

    await user.click(screen.getByRole('button', { name: 'Select none' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Data only' }));
    expect(screen.getByRole('checkbox', { name: /prNumber/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^DATA title$/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /otherNotes/ })).not.toBeChecked();
  });

  test('given fields are selected, when Preview JSON is clicked, then the selection is persisted and the preview is rendered', async () => {
    const user = userEvent.setup();
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });

    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => {
      expect(window.buildExportPayload).toHaveBeenCalled();
    });

    const putCall = global.fetch.mock.calls.find(
      ([url, init]) => String(url) === '/view-prs/user-defaults' && String(init?.method).toUpperCase() === 'PUT',
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall[1].body);
    expect(body['export-data-fields'].sort()).toEqual(['prNumber', 'title']);
    expect(body['export-user-state-fields']).toEqual(['notesByPrNumber.otherNotes']);

    await waitFor(() => {
      expect(screen.getByText('Prepared export JSON for 1 visible PR.')).toBeInTheDocument();
    });
  });

  test('given no fields are selected, when Preview JSON is clicked, then a validation error is shown instead of building JSON', async () => {
    const user = userEvent.setup();
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => {
      expect(screen.getByText('Select at least one field before exporting.')).toBeInTheDocument();
    });
    expect(window.buildExportPayload).not.toHaveBeenCalled();
  });

  test('given a browser with clipboard support, when Copy JSON is clicked, then the export JSON is written to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
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
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
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
