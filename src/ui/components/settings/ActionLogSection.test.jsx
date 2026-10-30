/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act, fireEvent } = require('@testing-library/react');
const { ActionLogSection } = require('./ActionLogSection');
const { SettingsDrawerContext } = require('../../state/SettingsDrawerContext');
const { createPrFormattingHelpers } = require('../../helpers/pr-formatting.helpers.ts');

const { formatIsoDatetime } = createPrFormattingHelpers();

// The drawer, open at a section.
const drawerAt = (section) => ({ isOpen: true, section, open: () => {}, close: () => {}, setSection: () => {} });

const mockEmptyFetchOnce = () =>
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entries: [] }) });

describe('ActionLogSection', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('given it mounts, when mounted, then it automatically loads without needing an external trigger', async () => {
    mockEmptyFetchOnce();

    await act(async () => {
      render(React.createElement(ActionLogSection));
    });

    expect(global.fetch).toHaveBeenCalledWith('/view-prs/action-log');
    expect(screen.getByText('No actions logged yet.')).toBeInTheDocument();
  });

  test('given it mounts, when mounted, then it shows its Refresh button', async () => {
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

  // It reloads each time its Settings section comes back into view,
  // without a second load at mount when it's already showing.
  describe('reloading when its section comes into view', () => {
    const tree = (section) =>
      React.createElement(SettingsDrawerContext.Provider, { value: drawerAt(section) }, React.createElement(ActionLogSection));
    const renderAt = (section) => render(tree(section));

    test('given the section is not showing at mount, when it comes into view later, then it reloads', async () => {
      mockEmptyFetchOnce(); // the mount-triggered load
      let rerender;
      await act(async () => {
        ({ rerender } = renderAt('run'));
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      mockEmptyFetchOnce();
      await act(async () => {
        rerender(tree('action-log'));
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('given the section is already showing at mount, when mounted, then it loads exactly once (not twice)', async () => {
      mockEmptyFetchOnce();
      await act(async () => {
        renderAt('action-log');
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('given the section leaves view after mount, when it does, then nothing reloads', async () => {
      mockEmptyFetchOnce();
      let rerender;
      await act(async () => {
        ({ rerender } = renderAt('action-log'));
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender(tree('run'));
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
