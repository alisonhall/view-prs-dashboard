/** @jest-environment jsdom */

const React = require('react');

// AppRoot's own mountAppRoot() calls root.render() directly (not via
// @testing-library/react's render(), which sets this for us) - without it,
// React 18 warns that every render/update here happens outside act().
global.IS_REACT_ACT_ENVIRONMENT = true;

// Track C, slice C2d (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// every mount function was folded into one <AppRoot /> component, mounted
// once (via mountAppRoot(), called at module load time below) into a
// single shared root. PrTableApp is mocked so these tests exercise
// AppRoot's own mounting logic without depending on PrTableApp's own render
// tree - that's covered by PrTableApp.test.jsx. Mocked to call the *real*
// usePrData() and capture its result, so this still exercises the real
// <PrDataProvider />'s state.
//
// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// window.mountReactPrTable is gone. index.page.js used to fetch the data and
// then call it; PrDataProvider now fetches /view-prs/data itself on mount
// (loadOnMount) and AppRoot's PrTablePortal mounts the table into
// #pr-sections once that first payload is rendered. These tests drive that
// through a fetch mock whose /view-prs/data response the test resolves.
const capturedContext = [];
jest.mock('./components/PrTableApp', () => {
  const ReactForMock = require('react');
  const { usePrData } = require('./state/PrDataContext');
  return {
    PrTableApp: (props) => {
      capturedContext.push({ ...usePrData(), ...props });
      return ReactForMock.createElement('div', { 'data-testid': 'pr-table-app' });
    },
  };
});

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
let resolveDataFetch;
const dataFetched = new Promise((resolve) => {
  resolveDataFetch = resolve;
});
const initialPayload = {
  ok: true,
  byPrNumber: { 1: { prNumber: '1' } },
  lastRun: { repo: 'owner/repo', updatedAt: '2026-10-21T10:00:00Z' },
};
global.fetch = jest.fn((url) => {
  if (String(url) === '/view-prs/data') {
    return dataFetched.then(() => okJson(initialPayload));
  }
  return Promise.resolve(okJson({ ok: true }));
});

// Window-bridge elimination Phase 7.5: the 'viewprs:react-ready' ordering
// guard that lived here is gone with the event (its last listener was
// index.page.js's credential-hint pass, now props on the inputs). The tests
// below check what the bootstrap does instead.

const getPrTableApp = () => document.querySelector('#pr-sections [data-testid="pr-table-app"]');

describe('react-app.jsx: AppRoot mounts the PR table once PrDataProvider has data', () => {
  beforeAll(async () => {
    // AppRoot resolves its portal containers once, on its first render.
    document.body.innerHTML = '<div id="pr-sections"></div><div id="settings-drawer-root"></div>';
    React.act(() => {
      require('./react-app');
    });
    await Promise.resolve();
  });

  // Phase 7.5: moved from index.page.js. The Run Script inputs render the
  // password-manager hints themselves, and the bootstrap installs the
  // credential-field error filters before mounting.
  test('given the app has mounted, when the Settings drawer repo input is read, then it carries the non-credential-field hints and keeps its name', () => {
    const repo = document.getElementById('repo');
    expect(repo).not.toBeNull();
    expect(repo.getAttribute('name')).toBe('repo');
    expect(repo.getAttribute('autocomplete')).toBe('off');
    expect(repo.getAttribute('data-lpignore')).toBe('true');
  });

  test('given the app has mounted, when a password-manager credential-field error reaches window, then it is suppressed, while other errors are not', () => {
    const ignored = new ErrorEvent('error', { message: 'ControlLooksLikePasswordCredentialField', cancelable: true });
    window.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(true);

    const other = new ErrorEvent('error', { message: 'Some real failure', cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  // These run in order against the one app mounted above.
  test('given the initial data fetch is still pending, when the app has mounted, then the PR table is not rendered yet', () => {
    expect(global.fetch).toHaveBeenCalledWith('/view-prs/data');
    expect(getPrTableApp()).toBeNull();
    expect(capturedContext).toHaveLength(0);
  });

  test('given the initial data fetch resolves, when it is rendered, then PrTableApp mounts in #pr-sections with that payload and its resolved repo', async () => {
    await React.act(async () => {
      resolveDataFetch();
      await dataFetched;
    });

    expect(getPrTableApp()).not.toBeNull();
    expect(capturedContext.at(-1).payload).toEqual(initialPayload);
    expect(capturedContext.at(-1).selectedRepo).toBe('owner/repo');
  });

  // Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): pushes
  // the update through the mounted PrDataProvider's own applyFreshTablePayload
  // (read from the captured Context) - it was window.updateReactPrTable.
  test('given a mounted table, when applyFreshTablePayload is called with a new payload but no repo, then PrTableApp re-renders with the new payload and keeps the previous selectedRepo', () => {
    const { applyFreshTablePayload } = capturedContext.at(-1);
    capturedContext.length = 0;

    const nextPayload = { byPrNumber: { 2: { prNumber: '2' } } };
    React.act(() => {
      applyFreshTablePayload(nextPayload);
    });

    expect(capturedContext.at(-1).payload).toBe(nextPayload);
    expect(capturedContext.at(-1).selectedRepo).toBe('owner/repo');
  });
});
