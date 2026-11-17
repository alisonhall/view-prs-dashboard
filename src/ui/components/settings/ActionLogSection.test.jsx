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

  test('given the Refresh button is clicked, when the fetch resolves with entries, then it lists one line per entry with its duration, status and summary, the rest folded', async () => {
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

    expect(screen.getByText(formatIsoDatetime(new Date('2026-05-01T10:00:00Z').toISOString()))).toBeInTheDocument();
    expect(screen.getByText('250ms')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getAllByText('manual-stop').length).toBeGreaterThan(0);
    expect(screen.getByText('Failed', { selector: '.action-log-status' })).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByText('owner/repo', { selector: '.action-log-repos' })).toBeInTheDocument();
    // Folded under its line.
    expect(screen.getByText('<failed>', { selector: 'dd' })).toBeInTheDocument();
  });

  describe('its filters, and opening at an entry', () => {
    const entries = [
      {
        action: 'job/quickCheck',
        kind: 'quickCheck',
        origin: 'background',
        ok: true,
        triggeredAt: '2026-11-05T10:10:00.000Z',
        timestamp: '2026-11-05T10:10:02.000Z',
        detail: { repos: ['acme/api'], reposCheckedCount: 1 },
      },
      {
        action: 'job/autoRefresh',
        kind: 'autoRefresh',
        origin: 'background',
        skipped: true,
        ok: null,
        triggeredAt: '2026-11-05T10:05:00.000Z',
        timestamp: '2026-11-05T10:05:00.000Z',
        detail: { reason: 'circuit-open', repos: ['acme/web'] },
      },
      { action: 'post/ack', ok: true, triggeredAt: '2026-11-05T10:00:00.000Z', timestamp: '2026-11-05T10:00:01.000Z', detail: { repo: 'acme/api' } },
    ];
    const mockEntries = () => global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, entries }) });
    const labels = () => Array.from(document.querySelectorAll('.action-log-label')).map((node) => node.textContent);

    test('by outcome, who and repo, with a count and Clear filters', async () => {
      mockEntries();
      await act(async () => {
        render(React.createElement(ActionLogSection));
      });
      expect(labels()).toEqual(['Quick check', 'Full refresh', 'Ack/Clear']);
      expect(screen.getByText('3 logged')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'problems' } });
      expect(labels()).toEqual(['Full refresh']);
      expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'you' } });
      expect(labels()).toEqual(['Ack/Clear']);

      fireEvent.change(screen.getByLabelText('Who'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Repo'), { target: { value: 'acme/api' } });
      expect(labels()).toEqual(['Quick check', 'Ack/Clear']);

      fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'autoRefresh' } });
      expect(screen.getByText('Nothing logged matches these filters.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(labels()).toHaveLength(3);
    });

    test("opened at a Just finished item's entry: loads again, clears the filters hiding it, and opens it", async () => {
      mockEntries();
      const drawer = (focus) => ({ ...drawerAt('action-log'), actionLogFocus: focus });
      const tree = (focus) =>
        React.createElement(SettingsDrawerContext.Provider, { value: drawer(focus) }, React.createElement(ActionLogSection));
      let rerender;
      await act(async () => {
        ({ rerender } = render(tree(null)));
      });
      fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'you' } });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender(tree({ kind: 'autoRefresh', atMs: Date.parse('2026-11-05T10:05:01.000Z'), requestedAt: Date.now() }));
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(labels()).toHaveLength(3);
      const focused = document.querySelector('.action-log-entry[data-focused]');
      expect(focused.querySelector('.action-log-label').textContent).toBe('Full refresh');
      expect(focused.querySelector('details').open).toBe(true);
      expect(screen.queryByText(/isn't in the log/)).not.toBeInTheDocument();
    });

    test("says so when the log doesn't have the entry asked for (a run with nothing to do isn't logged)", async () => {
      mockEntries();
      const tree = (focus) =>
        React.createElement(SettingsDrawerContext.Provider, { value: { ...drawerAt('action-log'), actionLogFocus: focus } }, React.createElement(ActionLogSection));
      let rerender;
      await act(async () => {
        ({ rerender } = render(tree(null)));
      });
      await act(async () => {
        rerender(tree({ kind: 'mergedQueueDrain', atMs: Date.parse('2026-11-05T10:05:01.000Z'), requestedAt: Date.now() }));
      });

      expect(screen.getByRole('status')).toHaveTextContent("That one isn't in the log - runs with nothing to do aren't logged.");
      expect(document.querySelector('.action-log-entry[data-focused]')).toBeNull();

      // Gone with the next load.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      });
      expect(screen.queryByText(/isn't in the log/)).not.toBeInTheDocument();
    });
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
