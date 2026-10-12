/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AutoRenderBlockedStatusText } = require('./AutoRenderBlockedStatusText');
const { AutoRenderBlockingContext } = require('../state/AutoRenderBlockingContext');

describe('AutoRenderBlockedStatusText', () => {
  test('given a Context value with statusText, when rendering, then it shows that text', () => {
    render(
      <AutoRenderBlockingContext.Provider
        value={{ isBlocked: true, statusText: '1 note section unsaved', discardAndApply: () => {} }}
      >
        <AutoRenderBlockedStatusText />
      </AutoRenderBlockingContext.Provider>,
    );

    expect(screen.getByText('1 note section unsaved')).toBeInTheDocument();
    expect(document.getElementById('auto-render-blocked-status')).toBeInTheDocument();
  });

  test('given no Provider ancestor, when rendering, then it uses the safe default (empty) text without throwing', () => {
    expect(() => render(<AutoRenderBlockedStatusText />)).not.toThrow();
    expect(document.getElementById('auto-render-blocked-status')).toHaveTextContent('');
  });
});
