/** @jest-environment jsdom */

const { act, render, screen, waitFor, within } = require('@testing-library/react');
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
    <PrTableOpenSectionsContext.Provider value={{ prKeysInOpenSections: ['owner/repo#11'], openSectionCount: 1, ...uiState }}>
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
      uiState: { prKeysInOpenSections: ['owner/repo#12'], openSectionCount: 1 },
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
      uiState: { prKeysInOpenSections: [], openSectionCount: 0 },
    });
    await waitForAllFieldsSelected();

    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));

    await waitFor(() => expect(screen.getByText('Prepared export JSON for 0 visible PRs.')).toBeInTheDocument());
  });

  test('given the table\'s open sections change, when the tab re-renders, then its summary updates without a click', () => {
    const { rerender } = renderExportSection({
      initialPayload: twoPrPayload,
      selectedRepo: 'owner/repo',
      uiState: { prKeysInOpenSections: ['owner/repo#11'], openSectionCount: 1 },
    });
    expect(screen.getByText(/Visible PR rows eligible for export: 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Expanded PR sections: 1/)).toBeInTheDocument();

    rerender(
      buildTree({
        initialPayload: twoPrPayload,
        selectedRepo: 'owner/repo',
        uiState: { prKeysInOpenSections: ['owner/repo#11', 'owner/repo#12'], openSectionCount: 3 },
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

  test("saving the selection keeps the other settings, and writes nothing when they can't be read (it would lose them)", async () => {
    const user = userEvent.setup();
    let readOk = true;
    global.fetch = jest.fn((url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (String(url) === '/view-prs/user-defaults' && method === 'GET') {
        return Promise.resolve(readOk ? { ok: true, json: async () => ({ overrides: { theme: 'dark' } }) } : { ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });
    const puts = () => global.fetch.mock.calls.filter(([, init]) => String(init?.method).toUpperCase() === 'PUT');
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(6));

    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(JSON.parse(puts()[0][1].body)).toMatchObject({ theme: 'dark' });

    readOk = false;
    const reads = () => global.fetch.mock.calls.filter(([, init]) => String(init?.method || 'GET').toUpperCase() === 'GET').length;
    const readsBefore = reads();
    await user.click(screen.getByRole('checkbox', { name: /^DATA title$/ }));
    await user.click(screen.getByRole('button', { name: 'Preview JSON' }));
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore));
    await act(async () => {});
    expect(puts()).toHaveLength(1);
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

describe('ExportSection profiles', () => {
  // The user defaults the server keeps: GET returns them, PUT replaces them.
  let saved;
  let writesFail;
  beforeEach(() => {
    saved = { theme: 'dark' };
    writesFail = false;
    global.fetch = jest.fn(async (url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (String(url) !== '/view-prs/user-defaults') return { ok: true, json: async () => ({}) };
      if (method === 'PUT') {
        if (writesFail) return { ok: false, json: async () => ({}) };
        saved = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({ overrides: saved }) };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const savedProfiles = () => saved.exportFieldProfiles?.profiles;
  const profileChip = (name) => within(screen.getByRole('group', { name: 'Export profiles' })).getByRole('button', { name });
  const checkbox = (name) => screen.getByRole('checkbox', { name });
  const renderReady = async () => {
    renderExportSection({ initialPayload: samplePayload, selectedRepo: 'owner/repo' });
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      screen.getAllByRole('checkbox').forEach((each) => expect(each).toBeChecked());
    });
  };
  const saveAsProfile = async (user, name) => {
    await user.click(screen.getByRole('button', { name: 'Save as profile' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new profile' }), `${name}{Enter}`);
  };

  test('"Save as profile" names the chosen fields and saves them with the user defaults, keeping the other settings', async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.queryByRole('button', { name: 'Save as profile' })).not.toBeInTheDocument();
    await user.click(checkbox(/^DATA title$/));
    await user.click(checkbox(/^USER notesByPrNumber$/));

    await saveAsProfile(user, 'Titles and notes');
    expect(profileChip('Titles and notes')).toHaveAttribute('aria-pressed', 'true');
    expect(profileChip('Titles and notes')).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Save as profile' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(savedProfiles()).toEqual([
        expect.objectContaining({ name: 'Titles and notes', dataPaths: ['title'], userStatePaths: ['notesByPrNumber'] }),
      ]),
    );
    expect(saved.theme).toBe('dark');
  });

  test('a profile applies its fields in one click; once they change it shows "(modified)", and Update saves the change into it', async () => {
    saved.exportFieldProfiles = { profiles: [{ id: 'p1', name: 'Numbers', dataPaths: ['prNumber'], userStatePaths: [] }] };
    const user = userEvent.setup();
    await renderReady();
    await waitFor(() => expect(profileChip('Numbers')).toHaveAttribute('aria-pressed', 'false'));

    await user.click(profileChip('Numbers'));
    expect(profileChip('Numbers')).toHaveAttribute('aria-pressed', 'true');
    expect(checkbox(/prNumber/)).toBeChecked();
    expect(checkbox(/^DATA title$/)).not.toBeChecked();
    expect(checkbox(/^USER ackByRepo$/)).not.toBeChecked();

    await user.click(checkbox(/^DATA title$/));
    expect(profileChip('Numbers (modified)')).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Update “Numbers”' }));
    expect(profileChip('Numbers')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(savedProfiles()?.[0]).toMatchObject({ dataPaths: ['prNumber', 'title'], userStatePaths: [] }));
  });

  test("a profile's field the loaded data doesn't have is listed as such, ticked, and can be unticked", async () => {
    saved.exportFieldProfiles = { profiles: [{ id: 'p1', name: 'Old', dataPaths: ['title', 'gone'], userStatePaths: [] }] };
    const user = userEvent.setup();
    await renderReady();
    await waitFor(() => expect(profileChip('Old')).toBeInTheDocument());
    await user.click(profileChip('Old'));

    const missing = checkbox(/^DATA gone · not in the loaded data$/);
    expect(missing).toBeChecked();
    await user.click(missing);
    expect(screen.queryByRole('checkbox', { name: /gone/ })).not.toBeInTheDocument();
    expect(profileChip('Old (modified)')).toBeInTheDocument();
  });

  test('Manage export profiles renames and deletes them; Undo puts one back where it was, with focus', async () => {
    saved.exportFieldProfiles = {
      profiles: [
        { id: 'p1', name: 'One', dataPaths: ['prNumber'], userStatePaths: [] },
        { id: 'p2', name: 'Two', dataPaths: ['title'], userStatePaths: [] },
      ],
    };
    const user = userEvent.setup();
    await renderReady();
    await waitFor(() => expect(profileChip('One')).toBeInTheDocument());
    await user.click(screen.getByText('Manage export profiles'));

    await user.click(screen.getByRole('button', { name: 'Rename One' }));
    const name = screen.getByRole('textbox', { name: 'New name for One' });
    await user.clear(name);
    await user.type(name, 'Numbers{Enter}');
    expect(screen.getByRole('button', { name: 'Rename Numbers' })).toHaveFocus();
    await waitFor(() => expect(savedProfiles()?.map((profile) => profile.name)).toEqual(['Numbers', 'Two']));

    await user.click(screen.getByRole('button', { name: 'Delete Numbers' }));
    expect(screen.getByRole('button', { name: 'Undo deleting Numbers' })).toHaveFocus();
    await waitFor(() => expect(savedProfiles()?.map((profile) => profile.name)).toEqual(['Two']));

    await user.click(screen.getByRole('button', { name: 'Undo deleting Numbers' }));
    expect(screen.getByRole('button', { name: 'Rename Numbers' })).toHaveFocus();
    await waitFor(() => expect(savedProfiles()?.map((profile) => profile.name)).toEqual(['Numbers', 'Two']));
  });

  test("a profile that can't be saved is taken back off, and that's said", async () => {
    const user = userEvent.setup();
    await renderReady();
    writesFail = true;
    await saveAsProfile(user, 'Everything');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save your profiles');
    expect(screen.queryByRole('group', { name: 'Export profiles' })).not.toBeInTheDocument();
    expect(savedProfiles()).toBeUndefined();
  });
});
