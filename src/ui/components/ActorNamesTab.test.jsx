/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { ActorNamesTab } = require('./ActorNamesTab');

// Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): this
// component is now lazy-loaded, so it can no longer rely on being eagerly
// mounted (and its window.triggerActorNameCacheLoad bridge already
// registered) before pr-management-tabs.helpers.js's tab-click handler
// fires its own trigger call on first activation - it loads itself on
// mount now, same as the manual bridge trigger does on every later
// re-activation/Refresh click. Most tests below rely on that mount-time
// load rather than calling the bridge explicitly; findByText/waitFor
// already tolerate its async timing.
const triggerLoad = () => act(() => window.triggerActorNameCacheLoad());

describe('ActorNamesTab', () => {
  afterEach(() => {
    delete global.fetch;
    delete window.triggerActorNameCacheLoad;
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
    expect(typeof window.triggerActorNameCacheLoad).toBe('function');

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

  test('given the bridge is triggered manually, when re-loading, then both endpoints are fetched again', async () => {
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

    await triggerLoad();

    expect(nameCacheCalls).toBe(2);
  });

  test('when unmounted, then it removes the window.triggerActorNameCacheLoad bridge', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) }));

    let unmount;
    await act(async () => {
      ({ unmount } = render(<ActorNamesTab />));
    });
    expect(typeof window.triggerActorNameCacheLoad).toBe('function');

    unmount();

    expect(window.triggerActorNameCacheLoad).toBeUndefined();
  });
});
