/** @jest-environment jsdom */

// window.DOMPurify must exist *before* the component module is first
// required, since the module registers its afterSanitizeAttributes hook (and
// reads window.DOMPurify for the sanitize config) at module-load time, not
// per-render - see InsightsHookSection.jsx's own top-of-file comment.
const registeredHooks = {};
const sanitizeMock = jest.fn((html) => html);
window.DOMPurify = {
  addHook: (name, fn) => {
    registeredHooks[name] = fn;
  },
  sanitize: sanitizeMock,
};

const React = require('react');
const { render, screen, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { InsightsHookSection } = require('./InsightsHookSection');

function mockFetchOnce(payload, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  });
}

describe('InsightsHookSection', () => {
  beforeEach(() => {
    sanitizeMock.mockClear();
    sanitizeMock.mockImplementation((html) => html);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('registers an afterSanitizeAttributes hook that adds rel="noopener noreferrer" to target=_blank links', () => {
    expect(typeof registeredHooks.afterSanitizeAttributes).toBe('function');

    const blankLinkNode = {
      tagName: 'A',
      getAttribute: (name) => (name === 'target' ? '_blank' : null),
      setAttribute: jest.fn(),
    };
    registeredHooks.afterSanitizeAttributes(blankLinkNode);
    expect(blankLinkNode.setAttribute).toHaveBeenCalledWith('rel', 'noopener noreferrer');

    const plainLinkNode = {
      tagName: 'A',
      getAttribute: () => null,
      setAttribute: jest.fn(),
    };
    registeredHooks.afterSanitizeAttributes(plainLinkNode);
    expect(plainLinkNode.setAttribute).not.toHaveBeenCalled();
  });

  test('renders nothing when repo/prNumber are missing', () => {
    render(<InsightsHookSection repo="" prNumber="" />);
    expect(document.querySelector('.pr-insights-hook-content')).not.toBeInTheDocument();
  });

  test('renders nothing when fetch is unavailable in this environment', () => {
    delete global.fetch;
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);
    expect(document.querySelector('.pr-insights-hook-content')).not.toBeInTheDocument();
  });

  test('sanitizes and renders the hook html, forbidding style/link/base/meta/form tags', async () => {
    mockFetchOnce({ ok: true, html: '<div>hook output</div>', error: null });
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);

    await waitFor(() => expect(screen.getByText('hook output')).toBeInTheDocument());
    expect(sanitizeMock).toHaveBeenCalledWith(
      '<div>hook output</div>',
      { FORBID_TAGS: ['style', 'link', 'base', 'meta', 'form'] },
    );
  });

  test('strips a <form> tag from the hook html using the real DOMPurify sanitizer', async () => {
    // Uses the real dompurify package (not the sanitizeMock stub above) to
    // prove the actual library honors FORBID_TAGS for 'form' - a mocked
    // sanitize() only proves the config object is *passed*, not that it
    // actually strips anything.
    const realDOMPurify = require('dompurify');
    sanitizeMock.mockImplementation((html, config) => realDOMPurify.sanitize(html, config));

    mockFetchOnce({
      ok: true,
      html: '<div>before</div><form action="http://evil.example"><input name="password"></form><div>after</div>',
      error: null,
    });
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);

    await waitFor(() => expect(screen.getByText('before')).toBeInTheDocument());
    expect(screen.getByText('after')).toBeInTheDocument();
    // The <form> element itself (the thing that gives an <input> somewhere
    // to submit to) is what FORBID_TAGS removes - DOMPurify still allows a
    // standalone <input> with no wrapping form, which is inert on its own.
    expect(document.querySelector('form')).not.toBeInTheDocument();
  });

  test('renders nothing and does not warn when no hook is configured (html and error both null)', async () => {
    mockFetchOnce({ ok: true, html: null, error: null });
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(document.querySelector('.pr-insights-hook-content')).not.toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('logs a console.warn with the server-provided reason when a configured hook script fails', async () => {
    mockFetchOnce({ ok: true, html: null, error: 'Command exited with code 127' });
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);

    await waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith('[insights hook] Command exited with code 127'),
    );
    expect(document.querySelector('.pr-insights-hook-content')).not.toBeInTheDocument();
  });

  test('renders nothing when the response is not ok', async () => {
    mockFetchOnce({ ok: false, error: 'boom' }, false);
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(document.querySelector('.pr-insights-hook-content')).not.toBeInTheDocument();
  });

  test('renders nothing when sanitization strips everything (e.g. DOMPurify unavailable)', async () => {
    sanitizeMock.mockReturnValueOnce('');
    mockFetchOnce({ ok: true, html: '<script>evil()</script>', error: null });
    render(<InsightsHookSection repo="owner/repo" prNumber="1" />);

    await waitFor(() => expect(sanitizeMock).toHaveBeenCalled());
    expect(document.querySelector('.pr-insights-hook-content')).not.toBeInTheDocument();
  });
});
