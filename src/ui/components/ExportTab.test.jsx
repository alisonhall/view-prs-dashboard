/** @jest-environment jsdom */

const { render, screen, waitFor } = require('@testing-library/react');
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

// getVisiblePrNumbersFromSectionsHost (pr-export.helpers.ts) is a real,
// unmockable function now (Phase 7, see REACT_MIGRATION_PLAN.md -
// ExportTab.jsx imports it directly instead of reading window.
// getVisiblePrNumbersFromSectionsHost) - it reads the real #pr-sections
// markup PrSection.jsx/PrNumberCell.jsx render in the actual app, which
// this isolated ExportTab-only test harness never mounts. Build the same
// shape by hand (an open .pr-group-section containing a .pr-number-cell
// with matching data-pr-number) so "visible PR" assertions still have a
// real, non-mocked #pr-sections to read from.
const mountPrSectionsHost = (prNumbers) => {
  const host = document.createElement('div');
  host.id = 'pr-sections';
  const section = document.createElement('details');
  section.className = 'pr-group-section';
  section.open = true;
  prNumbers.forEach((prNumber) => {
    const cell = document.createElement('td');
    cell.className = 'pr-number-cell';
    cell.setAttribute('data-pr-number', String(prNumber));
    section.appendChild(cell);
  });
  host.appendChild(section);
  document.body.appendChild(host);
  return host;
};

describe('ExportTab', () => {
  let prSectionsHost;

  beforeEach(() => {
    prSectionsHost = mountPrSectionsHost([11]);

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
    prSectionsHost?.remove();
    jest.restoreAllMocks();
  });

  // Accessibility naming: the field list, status and preview are findable by
  // role and name (e2e uses these instead of ids/classes).
  test('given the tab, when rendered, then the field list, status and preview are named', async () => {
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => expect(screen.getByRole('group', { name: 'Export fields' })).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Export status' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Export preview' })).toBeInTheDocument();
  });

  test('given a populated field catalog, when rendered, then it lists data and user-state checkboxes, all selected by default', async () => {
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    });
  });

  test('given no exportable fields, when rendered, then it shows the empty-state message', () => {
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
  });

  test('given the user clicks "Select none" then "Data only", when selecting, then only data checkboxes end up checked', async () => {
    const user = userEvent.setup();
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

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
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

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
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

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
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

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
    renderExportTab({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });

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
