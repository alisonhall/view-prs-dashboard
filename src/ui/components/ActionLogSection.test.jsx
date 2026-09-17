/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, act } = require('@testing-library/react');
const { ActionLogSection } = require('./ActionLogSection');

describe('ActionLogSection', () => {
  beforeEach(() => {
    delete window.triggerActionLogLoad;
    delete window.formatIsoDatetime;
    global.fetch = jest.fn();
  });

  test('given no load has been triggered yet, when rendered, then it shows the empty-state message', () => {
    render(React.createElement(ActionLogSection));
    expect(screen.getByText('No actions logged yet.')).toBeInTheDocument();
  });

  test('given it mounts, when mounted, then it registers window.triggerActionLogLoad and cleans it up on unmount', () => {
    const { unmount } = render(React.createElement(ActionLogSection));
    expect(typeof window.triggerActionLogLoad).toBe('function');
    unmount();
    expect(window.triggerActionLogLoad).toBeUndefined();
  });

  test('given the bridge is triggered, when the fetch resolves with no entries, then it shows the empty-state message', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entries: [] }) });
    render(React.createElement(ActionLogSection));

    await act(async () => {
      await window.triggerActionLogLoad();
    });

    expect(global.fetch).toHaveBeenCalledWith('/view-prs/action-log');
    expect(screen.getByText('No actions logged yet.')).toBeInTheDocument();
  });

  test('given the bridge is triggered, when the fetch resolves with entries, then it renders a table row per entry with formatted duration/status/detail', async () => {
    window.formatIsoDatetime = (value) => `fmt:${value}`;
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

    render(React.createElement(ActionLogSection));
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

  test('given the fetch response is not ok, when the bridge is triggered, then it shows the server-provided error message', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'unavailable' }) });
    render(React.createElement(ActionLogSection));

    await act(async () => {
      await window.triggerActionLogLoad();
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load action log: unavailable')).toBeInTheDocument();
    });
  });

  test('given fetch itself rejects, when the bridge is triggered, then it shows the thrown error message', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    render(React.createElement(ActionLogSection));

    await act(async () => {
      await window.triggerActionLogLoad();
    });

    expect(screen.getByText('Failed to load action log: network down')).toBeInTheDocument();
  });

  test('given the bridge is triggered again, when re-loading, then it shows the loading message before entries resolve', async () => {
    let resolveFetch;
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    render(React.createElement(ActionLogSection));

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
