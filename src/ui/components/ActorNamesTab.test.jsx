/** @jest-environment jsdom */

const { render, screen, waitFor, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { ActorNamesTab } = require('./ActorNamesTab');
const { TabStateContext } = require('../state/TabStateContext');

describe('ActorNamesTab', () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('given it mounts, when mounted, then it automatically loads both endpoints without needing an external trigger', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: { octocat: 'The Octocat' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
    });

    await act(async () => {
      render(<ActorNamesTab />);
    });

    expect(global.fetch).toHaveBeenCalledWith('/view-prs/actor-name-cache');
    expect(global.fetch).toHaveBeenCalledWith('/view-prs/actor-login-aliases');
    expect(await screen.findByText('Loaded 1 mapping.')).toBeInTheDocument();
  });

  test('given the tab is activated, when both endpoints succeed, then it loads and renders both mapping editors', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, entries: { octocat: 'The Octocat' } }),
        });
      }
      if (url === '/view-prs/actor-login-aliases') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, entries: { old_login: 'octocat' } }),
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<ActorNamesTab />);

    expect(await screen.findByText('Loaded 1 mapping.')).toBeInTheDocument();
    expect(await screen.findByText('Loaded 1 alias mapping.')).toBeInTheDocument();
    expect(screen.getByText('Display Name Mappings')).toBeInTheDocument();
    expect(screen.getByText('Login Alias Mappings')).toBeInTheDocument();
    // "octocat" appears twice: as the name-cache row's key and as the alias
    // row's canonical-login value.
    expect(screen.getAllByDisplayValue('octocat')).toHaveLength(2);
    expect(screen.getByDisplayValue('The Octocat')).toBeInTheDocument();
    expect(screen.getByDisplayValue('old_login')).toBeInTheDocument();
  });

  test('given the name-cache endpoint fails, when it loads, then only that editor shows an error status', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'boom' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
    });

    render(<ActorNamesTab />);

    expect(await screen.findByText('Failed to load cache: boom')).toBeInTheDocument();
    expect(await screen.findByText('Loaded 0 alias mappings.')).toBeInTheDocument();
  });

  test('given the alias endpoint rejects, when it loads, then the alias editor shows the thrown error text', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
      }
      return Promise.reject(new Error('network down'));
    });

    render(<ActorNamesTab />);

    expect(await screen.findByText('Failed to load aliases: network down')).toBeInTheDocument();
  });

  test('given loaded data, when either editor\'s Refresh button is clicked, then both endpoints reload (combined refresh)', async () => {
    let nameCacheCalls = 0;
    let aliasCalls = 0;
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        nameCacheCalls += 1;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
      }
      aliasCalls += 1;
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
    });

    const user = userEvent.setup();
    render(<ActorNamesTab />);

    await screen.findByText('Loaded 0 mappings.'); // mount's own auto-load
    expect(nameCacheCalls).toBe(1);
    expect(aliasCalls).toBe(1);

    // The Login Alias Mappings editor's own Refresh button - per the
    // documented quirk, this reloads BOTH the name cache and the aliases,
    // not just its own endpoint.
    const refreshButtons = screen.getAllByText('Refresh');
    await user.click(refreshButtons[1]);

    await waitFor(() => expect(nameCacheCalls).toBe(2));
    expect(aliasCalls).toBe(2);
  });

  test('given loaded data, when the name-cache editor\'s own Refresh button is clicked, then both endpoints reload too', async () => {
    const userForBridgeTest = userEvent.setup();
    let nameCacheCalls = 0;
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        nameCacheCalls += 1;
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
    });

    render(<ActorNamesTab />);
    await screen.findByText('Loaded 0 mappings.'); // mount's own auto-load
    expect(nameCacheCalls).toBe(1);

    await userForBridgeTest.click(screen.getAllByText('Refresh')[0]);

    expect(nameCacheCalls).toBe(2);
  });

  // Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 3): re-triggering on every later re-activation (switch away,
  // then back) used to be pr-management-tabs.helpers.js's own
  // activateTab("actor-name-cache") calling loadActorNameCache() directly,
  // outside React - now owned by this component's own effect watching
  // useIsTabPanelVisible(), guarded against double-firing alongside the
  // mount effect's own unconditional load (see this file's own
  // hasSkippedFirstRunRef comment).
  describe('re-triggering on tab re-activation', () => {
    const emptyFetch = () =>
      jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) }));

    const renderWithActiveManagementTab = (activeManagementTab) =>
      render(
        <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab }}>
          <ActorNamesTab />
        </TabStateContext.Provider>,
      );

    test('given the tab is not active at mount, when it becomes active later, then it reloads both endpoints', async () => {
      global.fetch = emptyFetch();
      let rerender;
      await act(async () => {
        ({ rerender } = renderWithActiveManagementTab('status'));
      });
      expect(global.fetch).toHaveBeenCalledTimes(2); // the mount-triggered load (2 endpoints)

      await act(async () => {
        rerender(
          <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab: 'actor-name-cache' }}>
            <ActorNamesTab />
          </TabStateContext.Provider>,
        );
      });

      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    test('given the tab is already active at mount, when mounted, then it loads exactly once (not twice)', async () => {
      global.fetch = emptyFetch();
      await act(async () => {
        renderWithActiveManagementTab('actor-name-cache');
      });

      expect(global.fetch).toHaveBeenCalledTimes(2); // 1 mount-triggered load, 2 endpoints
    });

    test('given the tab becomes inactive after mount, when it does, then nothing reloads', async () => {
      global.fetch = emptyFetch();
      let rerender;
      await act(async () => {
        ({ rerender } = renderWithActiveManagementTab('actor-name-cache'));
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);

      await act(async () => {
        rerender(
          <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab: 'status' }}>
            <ActorNamesTab />
          </TabStateContext.Provider>,
        );
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
