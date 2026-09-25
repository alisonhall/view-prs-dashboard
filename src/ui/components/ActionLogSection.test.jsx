/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act } = require('@testing-library/react');
const { ActionLogSection } = require('./ActionLogSection');

const mockEmptyFetchOnce = () =>
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entries: [] }) });

describe('ActionLogSection', () => {
  beforeEach(() => {
    delete window.triggerActionLogLoad;
    delete window.formatIsoDatetime;
    global.fetch = jest.fn();
  });

  // Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): this
  // component is now lazy-loaded, so it can no longer rely on being
  // eagerly mounted (and its window.triggerActionLogLoad bridge already
  // registered) before pr-management-tabs.helpers.js's tab-click handler
  // fires its own trigger call - it must load itself on mount instead.
  test('given it mounts, when mounted, then it automatically loads without needing an external trigger', async () => {
    mockEmptyFetchOnce();

    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    expect(global.fetch).toHaveBeenCalledWith('/view-prs/action-log');
    expect(screen.getByText('No actions logged yet.')).toBeInTheDocument();
  });

  test('given it mounts, when mounted, then it registers window.triggerActionLogLoad and cleans it up on unmount', async () => {
    mockEmptyFetchOnce();
    let unmount;
    await act(async () => {
      ({ unmount } = render(React.createElement(ActionLogSection)));
    });

    expect(typeof window.triggerActionLogLoad).toBe('function');
    unmount();
    expect(window.triggerActionLogLoad).toBeUndefined();
  });

  test('given the bridge is triggered again (e.g. Refresh, or re-activating the tab), when the fetch resolves with entries, then it renders a table row per entry with formatted duration/status/detail', async () => {
    window.formatIsoDatetime = (value) => `fmt:${value}`;
    mockEmptyFetchOnce(); // the mount-triggered load
    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        entries: [
          {
            triggeredAt: '2026-05-01T10:00:00Z',
            action: 'manual-start',
            ok: true,
            durationMs: 250,
            detail: { repo: 'owner/repo' },
          },
          {
            triggeredAt: '2026-05-01T10:01:00Z',
            action: 'manual-stop',
            ok: false,
            durationMs: 1500,
            detail: { reason: '<failed>' },
            error: 'boom',
          },
        ],
      }),
    });

    await act(async () => {
      await window.triggerActionLogLoad();
    });

    expect(screen.getByText('fmt:2026-05-01T10:00:00Z')).toBeInTheDocument();
    expect(screen.getByText('250ms')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('manual-stop')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('reason: <failed> · error: boom')).toBeInTheDocument();
  });

  test('given the fetch response is not ok, when it loads (on mount), then it shows the server-provided error message', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'unavailable' }) });

    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load action log: unavailable')).toBeInTheDocument();
    });
  });

  test('given fetch itself rejects, when it loads (on mount), then it shows the thrown error message', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    expect(screen.getByText('Failed to load action log: network down')).toBeInTheDocument();
  });

  test('given the bridge is triggered again, when re-loading, then it shows the loading message before entries resolve', async () => {
    mockEmptyFetchOnce(); // the mount-triggered load
    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    let resolveFetch;
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let loadPromise;
    act(() => {
      loadPromise = window.triggerActionLogLoad();
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ ok: true, entries: [] }) });
      await loadPromise;
    });
  });
});
