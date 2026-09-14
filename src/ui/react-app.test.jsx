/** @jest-environment jsdom */

const React = require('react');

// mountReactPrTable calls root.render() directly (not via
// @testing-library/react's render(), which sets this for us) - without it,
// React 18 warns that every render/update here happens outside act().
global.IS_REACT_ACT_ENVIRONMENT = true;

// PrTableApp is mocked so these tests exercise react-app.jsx's own mounting/
// update-bridge logic (root creation, prop merging on updateReactPrTable,
// the visiblePrNumbers undefined-vs-null distinction) without depending on
// PrTableApp's own render tree - that's covered by PrTableApp.test.jsx.
const capturedProps = [];
jest.mock('./components/PrTableApp', () => {
  const ReactForMock = require('react');
  return {
    PrTableApp: (props) => {
      capturedProps.push(props);
      return ReactForMock.createElement('div', { 'data-testid': 'pr-table-app' });
    },
  };
});

const { mountReactPrTable } = require('./react-app');

describe('react-app.jsx: mountReactPrTable / window.updateReactPrTable bridge', () => {
  beforeEach(() => {
    capturedProps.length = 0;
    document.body.innerHTML = '';
    delete window.updateReactPrTable;
  });

  test('given no container element, when mounting, then logs an error and returns null without throwing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = mountReactPrTable(null, { initialPayload: {}, selectedRepo: '' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('given a container and initial props, when mounted, then renders PrTableApp with those props and exposes window.updateReactPrTable', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const payload = { byPrNumber: { 1: { prNumber: '1' } } };

    React.act(() => {
      mountReactPrTable(container, { initialPayload: payload, selectedRepo: 'owner/repo' });
    });

    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0].initialPayload).toBe(payload);
    expect(capturedProps[0].selectedRepo).toBe('owner/repo');
    expect(container.querySelector('[data-testid="pr-table-app"]')).not.toBeNull();
    expect(typeof window.updateReactPrTable).toBe('function');
  });

  test('given a mounted table, when window.updateReactPrTable is called with a new payload but no repo, then PrTableApp re-renders with the new payload and keeps the previous selectedRepo', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    React.act(() => {
      mountReactPrTable(container, { initialPayload: { byPrNumber: {} }, selectedRepo: 'owner/repo' });
    });
    capturedProps.length = 0;

    const nextPayload = { byPrNumber: { 2: { prNumber: '2' } } };
    React.act(() => {
      window.updateReactPrTable(nextPayload);
    });

    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0].initialPayload).toBe(nextPayload);
    expect(capturedProps[0].selectedRepo).toBe('owner/repo');
  });

  test('given visiblePrNumbers is omitted on an update call, when re-rendering, then the previous visiblePrNumbers is preserved (not wiped to undefined)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    React.act(() => {
      mountReactPrTable(container, {
        initialPayload: {},
        selectedRepo: 'owner/repo',
        visiblePrNumbers: ['1', '2'],
      });
    });
    capturedProps.length = 0;

    React.act(() => {
      window.updateReactPrTable({ byPrNumber: {} }, 'owner/repo');
    });

    expect(capturedProps[0].visiblePrNumbers).toEqual(['1', '2']);
  });

  test('given null is explicitly passed as visiblePrNumbers on an update call, when re-rendering, then it overwrites the previous value to null ("everything filtered out")', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    React.act(() => {
      mountReactPrTable(container, {
        initialPayload: {},
        selectedRepo: 'owner/repo',
        visiblePrNumbers: ['1', '2'],
      });
    });
    capturedProps.length = 0;

    React.act(() => {
      window.updateReactPrTable({ byPrNumber: {} }, 'owner/repo', null);
    });

    expect(capturedProps[0].visiblePrNumbers).toBeNull();
  });

  test('given react-app.jsx finishes loading, when the module initializes, then it dispatches viewprs:react-ready so index.page.js can retry a mount that raced module loading', () => {
    // Regression guard for the load-order race described in react-app.jsx's
    // own trailing comment: index.page.js's first renderPrData() call can
    // resolve before this ES module (always deferred by the browser) has
    // finished loading, in which case it needs this event to know when a
    // retry is worthwhile.
    const handler = jest.fn();
    window.addEventListener('viewprs:react-ready', handler);
    jest.isolateModules(() => {
      require('./react-app');
    });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('viewprs:react-ready', handler);
  });
});
