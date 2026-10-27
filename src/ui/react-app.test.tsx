/** @jest-environment jsdom */

import { act } from 'react';

// react-app.tsx calls root.render() directly (not via @testing-library/
// react's render(), which sets this for us) - without it, React 18 warns
// that every render/update here happens outside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Importing react-app.tsx mounts the whole app into #app-root. PrTableApp is
// mocked (PrTableApp.test.tsx covers it) to capture the *real* usePrData(),
// so these tests check the real <PrDataProvider />: it fetches
// /view-prs/data itself on mount (loadOnMount), and AppShell mounts the
// table in #pr-sections once that first payload is rendered. A fetch mock
// whose /view-prs/data response the test resolves drives it.
const capturedContext: Array<Record<string, unknown>> = [];
jest.mock('./components/PrTableApp', () => {
  const { usePrData } = jest.requireActual('./state/PrDataContext');
  return {
    PrTableApp: () => {
      capturedContext.push({ ...usePrData() });
      return <div data-testid="pr-table-app" />;
    },
  };
});

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
let resolveDataFetch: () => void = () => {};
const dataFetched = new Promise<void>((resolve) => {
  resolveDataFetch = resolve;
});
const initialPayload = {
  ok: true,
  byPrNumber: { 1: { prNumber: '1' } },
  lastRun: { repo: 'owner/repo', updatedAt: '2026-10-21T10:00:00Z' },
};
const fetchMock = jest.fn((url: unknown) => {
  if (String(url) === '/view-prs/data') {
    return dataFetched.then(() => okJson(initialPayload));
  }
  return Promise.resolve(okJson({ ok: true }));
});
global.fetch = fetchMock as unknown as typeof fetch;

const getPrTableApp = () => document.querySelector('#pr-sections [data-testid="pr-table-app"]');

describe('react-app.tsx: mounts the app, and the PR table once PrDataProvider has data', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="app-root"></div>';
    await act(async () => {
      await import('./react-app');
    });
  });

  test('given index.html\'s #app-root, when the app has mounted, then the whole page renders inside it', () => {
    const root = document.getElementById('app-root');
    expect(root?.querySelector('header')).not.toBeNull();
    expect(root?.querySelector('#tab-panel-pr-data')).not.toBeNull();
    expect(root?.querySelector('#settings-drawer-root')).not.toBeNull();
  });

  // The Run Script inputs render the password-manager hints themselves, and
  // the bootstrap installs the credential-field error filters before
  // mounting.
  test('given the app has mounted, when the Settings drawer repo input is read, then it carries the non-credential-field hints and keeps its name', () => {
    const repo = document.getElementById('repo');
    expect(repo).toHaveAttribute('name', 'repo');
    expect(repo).toHaveAttribute('autocomplete', 'off');
    expect(repo).toHaveAttribute('data-lpignore', 'true');
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
    expect(fetchMock).toHaveBeenCalledWith('/view-prs/data');
    expect(getPrTableApp()).toBeNull();
    expect(capturedContext).toHaveLength(0);
  });

  test('given the initial data fetch resolves, when it is rendered, then PrTableApp mounts in #pr-sections with that payload and its resolved repo', async () => {
    await act(async () => {
      resolveDataFetch();
      await dataFetched;
    });

    expect(getPrTableApp()).not.toBeNull();
    expect(capturedContext.at(-1)?.payload).toEqual(initialPayload);
    expect(capturedContext.at(-1)?.selectedRepo).toBe('owner/repo');
  });

  // Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): pushes
  // the update through the mounted PrDataProvider's own applyFreshTablePayload
  // (read from the captured Context) - it was window.updateReactPrTable.
  test('given a mounted table, when applyFreshTablePayload is called with a new payload but no repo, then PrTableApp re-renders with the new payload and keeps the previous selectedRepo', () => {
    const { applyFreshTablePayload } = capturedContext.at(-1) as { applyFreshTablePayload: (payload: unknown) => void };
    capturedContext.length = 0;

    const nextPayload = { byPrNumber: { 2: { prNumber: '2' } } };
    act(() => {
      applyFreshTablePayload(nextPayload);
    });

    expect(capturedContext.at(-1)?.payload).toBe(nextPayload);
    expect(capturedContext.at(-1)?.selectedRepo).toBe('owner/repo');
  });
});
