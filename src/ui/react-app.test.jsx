/** @jest-environment jsdom */

const React = require('react');

// AppRoot's own mountAppRoot() calls root.render() directly (not via
// @testing-library/react's render(), which sets this for us) - without it,
// React 18 warns that every render/update here happens outside act().
global.IS_REACT_ACT_ENVIRONMENT = true;

// Track C, slice C2d (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// react-app.jsx no longer exports a standalone mountReactPrTable function -
// every mount function was folded into one <AppRoot /> component, mounted
// once (via mountAppRoot(), called at module load time below) into a
// single shared root. window.mountReactPrTable/window.updateReactPrTable
// are still the real external contract index.page.js calls - these tests
// exercise them the same way as before, just reached via window instead of
// an imported function. PrTableApp is mocked so these tests exercise
// AppRoot's own mounting/update-bridge logic (the visiblePrNumbers
// undefined-vs-null distinction, etc.) without depending on PrTableApp's
// own render tree - that's covered by PrTableApp.test.jsx. Mocked to call
// the *real* usePrData() and capture its result, so this still exercises
// the real <PrDataProvider />'s merge semantics.
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

// AppRoot's window.mountReactPrTable/etc. assignments happen inside
// useEffect, which React only flushes once the initial render commits -
// wrap the module's own top-level mountAppRoot() call in act() so those
// bridges are already assigned by the time the first test runs.
//
// Regression guard (recorded here, not in its own test, since the module
// bootstrap this checks only ever runs once at file scope - see the
// load-order race described in react-app.jsx's own AppRoot effect
// comment): 'viewprs:react-ready' must fire only once
// window.mountReactPrTable actually exists. Dispatching it any earlier
// (e.g. synchronously right after ReactDOM.createRoot(...).render(), which
// only schedules the initial commit rather than running it inline) let
// index.page.js's one-time listener consume its only retry before the
// bridge was real, permanently leaving the PR table on "Loading..." even
// though data had fetched fine - a real bug this same top-level bootstrap
// call didn't previously guard against.
let reactReadyBridgeWasFunctionWhenDispatched = null;
window.addEventListener('viewprs:react-ready', () => {
  reactReadyBridgeWasFunctionWhenDispatched = typeof window.mountReactPrTable === 'function';
});

describe('react-app.jsx: window.mountReactPrTable / window.updateReactPrTable bridge (AppRoot)', () => {
  // The module require (and its bootstrap dispatch check) live in
  // beforeAll, not file scope, because 'viewprs:react-ready' now dispatches
  // via queueMicrotask (see that effect's own comment in react-app.jsx - a
  // flushSync-reentrancy fix) - an actual `await` is needed to let that
  // microtask run before checking it fired, and only an async Jest
  // lifecycle hook can do that; top-level file scope can't await.
  beforeAll(async () => {
    React.act(() => {
      require('./react-app');
    });
    await Promise.resolve();
    if (reactReadyBridgeWasFunctionWhenDispatched !== true) {
      throw new Error(
        "'viewprs:react-ready' fired before window.mountReactPrTable was assigned",
      );
    }
  });

  beforeEach(() => {
    capturedContext.length = 0;
    document.body.innerHTML = '';
  });

  test('given no container element, when mounting, then logs an error and returns null without throwing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = window.mountReactPrTable(null, { initialPayload: {}, selectedRepo: '' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('given a container and initial props, when mounted, then renders PrTableApp with the Provider-supplied state', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const payload = { byPrNumber: { 1: { prNumber: '1' } } };

    React.act(() => {
      window.mountReactPrTable(container, { initialPayload: payload, selectedRepo: 'owner/repo' });
    });

    expect(capturedContext.at(-1).payload).toBe(payload);
    expect(capturedContext.at(-1).selectedRepo).toBe('owner/repo');
    expect(container.querySelector('[data-testid="pr-table-app"]')).not.toBeNull();
  });

  test('given a mounted table, when window.updateReactPrTable is called with a new payload but no repo, then PrTableApp re-renders with the new payload and keeps the previous selectedRepo', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    React.act(() => {
      window.mountReactPrTable(container, { initialPayload: { byPrNumber: {} }, selectedRepo: 'owner/repo' });
    });
    capturedContext.length = 0;

    const nextPayload = { byPrNumber: { 2: { prNumber: '2' } } };
    React.act(() => {
      window.updateReactPrTable(nextPayload);
    });

    expect(capturedContext.at(-1).payload).toBe(nextPayload);
    expect(capturedContext.at(-1).selectedRepo).toBe('owner/repo');
  });

  test('given visiblePrNumbers is omitted on an update call, when re-rendering, then the previous visiblePrNumbers is preserved (not wiped to undefined)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    React.act(() => {
      window.mountReactPrTable(container, {
        initialPayload: {},
        selectedRepo: 'owner/repo',
        visiblePrNumbers: ['1', '2'],
      });
    });
    capturedContext.length = 0;

    React.act(() => {
      window.updateReactPrTable({ byPrNumber: {} }, 'owner/repo');
    });

    expect(capturedContext.at(-1).visiblePrNumbers).toEqual(['1', '2']);
  });

  test('given null is explicitly passed as visiblePrNumbers on an update call, when re-rendering, then it overwrites the previous value to null ("everything filtered out")', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    React.act(() => {
      window.mountReactPrTable(container, {
        initialPayload: {},
        selectedRepo: 'owner/repo',
        visiblePrNumbers: ['1', '2'],
      });
    });
    capturedContext.length = 0;

    React.act(() => {
      window.updateReactPrTable({ byPrNumber: {} }, 'owner/repo', null);
    });

    expect(capturedContext.at(-1).visiblePrNumbers).toBeNull();
  });
});
