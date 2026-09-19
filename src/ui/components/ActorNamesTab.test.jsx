/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { ActorNamesTab } = require('./ActorNamesTab');

// ActorNamesTab does NOT auto-fetch on mount - it only registers `load` as
// window.triggerActorNameCacheLoad (see the component's own doc comment),
// to be invoked by the vanilla tab-switch chrome (pr-management-tabs.helpers.js)
// when the Actor Names tab is activated. Tests must trigger that bridge
// explicitly, the same way that real caller does.
const triggerLoad = () => act(() => window.triggerActorNameCacheLoad());

describe('ActorNamesTab', () => {
  afterEach(() => {
    delete global.fetch;
    delete window.triggerActorNameCacheLoad;
    jest.restoreAllMocks();
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
    await triggerLoad();

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

  test('given the name-cache endpoint fails, when the tab is activated, then only that editor shows an error status', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'boom' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
    });

    render(<ActorNamesTab />);
    await triggerLoad();

    expect(await screen.findByText('Failed to load cache: boom')).toBeInTheDocument();
    expect(await screen.findByText('Loaded 0 alias mappings.')).toBeInTheDocument();
  });

  test('given the alias endpoint rejects, when the tab is activated, then the alias editor shows the thrown error text', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/view-prs/actor-name-cache') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, entries: {} }) });
      }
      return Promise.reject(new Error('network down'));
    });

    render(<ActorNamesTab />);
    await triggerLoad();

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
    await triggerLoad();

    await screen.findByText('Loaded 0 mappings.');
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

  test('when unmounted, then it removes the window.triggerActorNameCacheLoad bridge', () => {
    const { unmount } = render(<ActorNamesTab />);
    expect(typeof window.triggerActorNameCacheLoad).toBe('function');

    unmount();

    expect(window.triggerActorNameCacheLoad).toBeUndefined();
  });
});
