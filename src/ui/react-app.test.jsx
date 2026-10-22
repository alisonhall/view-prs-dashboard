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

// Regression guard (recorded here, not in its own test, since the module
// bootstrap this checks only ever runs once at file scope - see the
// load-order race described in react-app.jsx's own AppRoot effect
// comment): 'viewprs:react-ready' must fire only once AppRoot's bridges
// exist. Dispatching it any earlier (e.g. synchronously right after
// ReactDOM.createRoot(...).render(), which only schedules the initial commit
// rather than running it inline) let index.page.js's one-time listeners
// consume their only retry before the bridge was real.
// Window-bridge elimination Phase 7.4: AppRoot publishes no window bridge any
// more (window.updateReactAutoRenderBlockedLinks, which this used to check,
// is gone). The one listener left, index.page.js's credential hints, needs
// AppRoot's portaled Run Script inputs, so this checks #repo is in the DOM.
let reactReadyBridgeWasFunctionWhenDispatched = null;
window.addEventListener('viewprs:react-ready', () => {
  reactReadyBridgeWasFunctionWhenDispatched = Boolean(document.getElementById('repo'));
});

const getPrTableApp = () => document.querySelector('#pr-sections [data-testid="pr-table-app"]');

describe('react-app.jsx: AppRoot mounts the PR table once PrDataProvider has data', () => {
  // The module require (and its bootstrap dispatch check) live in
  // beforeAll, not file scope, because 'viewprs:react-ready' dispatches via
  // queueMicrotask (see that effect's own comment in react-app.jsx - a
  // flushSync-reentrancy fix) - an actual `await` is needed to let that
  // microtask run before checking it fired, and only an async Jest
  // lifecycle hook can do that; top-level file scope can't await.
  beforeAll(async () => {
    // AppRoot resolves its portal containers once, on its first render.
    document.body.innerHTML = '<div id="pr-sections"></div><span id="repo-root"></span>';
    React.act(() => {
      require('./react-app');
    });
    await Promise.resolve();
    if (reactReadyBridgeWasFunctionWhenDispatched !== true) {
      throw new Error("'viewprs:react-ready' fired before AppRoot's portaled inputs were in the DOM");
    }
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

  test('given a mounted table, when window.updateReactPrTable is called with a new payload but no repo, then PrTableApp re-renders with the new payload and keeps the previous selectedRepo', () => {
    capturedContext.length = 0;

    const nextPayload = { byPrNumber: { 2: { prNumber: '2' } } };
    React.act(() => {
      window.updateReactPrTable(nextPayload);
    });

    expect(capturedContext.at(-1).payload).toBe(nextPayload);
    expect(capturedContext.at(-1).selectedRepo).toBe('owner/repo');
  });
});
