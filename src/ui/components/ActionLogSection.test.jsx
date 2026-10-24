/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act, fireEvent } = require('@testing-library/react');
const { ActionLogSection } = require('./ActionLogSection');
const { TabStateContext } = require('../state/TabStateContext');
const { createPrFormattingHelpers } = require('../helpers/pr-formatting.helpers.ts');

const { formatIsoDatetime } = createPrFormattingHelpers();

const mockEmptyFetchOnce = () =>
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entries: [] }) });

describe('ActionLogSection', () => {
  let refreshBtnRoot;

  beforeEach(() => {
    global.fetch = jest.fn();
    refreshBtnRoot = document.createElement('div');
    refreshBtnRoot.id = 'action-log-refresh-btn-root';
    document.body.appendChild(refreshBtnRoot);
  });

  afterEach(() => {
    refreshBtnRoot.remove();
  });

  test('given it mounts, when mounted, then it automatically loads without needing an external trigger', async () => {
    mockEmptyFetchOnce();

    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    expect(global.fetch).toHaveBeenCalledWith('/view-prs/action-log');
    expect(screen.getByText('No actions logged yet.')).toBeInTheDocument();
  });

  // Seventh follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit"): window.triggerActionLogLoad is gone - the "Refresh" button is
  // now portaled into #action-log-refresh-btn-root by this component
  // itself, calling its own local load() directly.
  test('given it mounts, when mounted, then it portals a real Refresh button into #action-log-refresh-btn-root', async () => {
    mockEmptyFetchOnce();

    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  test('given the Refresh button is clicked, when the fetch resolves with entries, then it renders a table row per entry with formatted duration/status/detail', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    });

    expect(screen.getByText(formatIsoDatetime('2026-05-01T10:00:00Z'))).toBeInTheDocument();
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

  test('given the Refresh button is clicked again, when re-loading, then it shows the loading message before entries resolve', async () => {
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

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ ok: true, entries: [] }) });
    });
  });

  // Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 3): re-triggering on every later re-activation (switch away,
  // then back) used to be pr-management-tabs.helpers.js's own
  // activateTab("action-log") calling loadActionLog() directly, outside
  // React - now owned by this component's own effect watching
  // useIsTabPanelVisible(), guarded against double-firing alongside the
  // mount effect's own unconditional load (see this file's own
  // hasSkippedFirstRunRef comment).
  describe('re-triggering on tab re-activation', () => {
    const renderWithActiveManagementTab = (activeManagementTab) =>
      render(
        React.createElement(
          TabStateContext.Provider,
          { value: { activeDataTab: 'pr-data', activeManagementTab } },
          React.createElement(ActionLogSection),
        ),
      );

    test('given the tab is not active at mount, when it becomes active later, then it reloads', async () => {
      mockEmptyFetchOnce(); // the mount-triggered load
      let rerender;
      await act(async () => {
        ({ rerender } = renderWithActiveManagementTab('status'));
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      mockEmptyFetchOnce();
      await act(async () => {
        rerender(
          React.createElement(
            TabStateContext.Provider,
            { value: { activeDataTab: 'pr-data', activeManagementTab: 'action-log' } },
            React.createElement(ActionLogSection),
          ),
        );
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('given the tab is already active at mount, when mounted, then it loads exactly once (not twice)', async () => {
      mockEmptyFetchOnce();
      await act(async () => {
        renderWithActiveManagementTab('action-log');
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('given the tab becomes inactive after mount, when it does, then nothing reloads', async () => {
      mockEmptyFetchOnce();
      let rerender;
      await act(async () => {
        ({ rerender } = renderWithActiveManagementTab('action-log'));
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender(
          React.createElement(
            TabStateContext.Provider,
            { value: { activeDataTab: 'pr-data', activeManagementTab: 'status' } },
            React.createElement(ActionLogSection),
          ),
        );
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
