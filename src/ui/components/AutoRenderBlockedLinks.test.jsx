/** @jest-environment jsdom */

const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AutoRenderBlockedLinks } = require('./AutoRenderBlockedLinks');

describe('AutoRenderBlockedLinks', () => {
  afterEach(() => {
    delete window.getAuthorInsightsDisplayName;
    delete window.navigateToPrInTable;
    delete window.navigateToAuthorInsights;
  });

  test('given no PR numbers or author logins, when rendering, then nothing renders', () => {
    const { container } = render(<AutoRenderBlockedLinks prNumbers={[]} authorLogins={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given PR numbers, when rendering, then a chip is shown per PR number', () => {
    render(<AutoRenderBlockedLinks prNumbers={['15', '22']} authorLogins={[]} />);
    expect(screen.getByRole('button', { name: '#15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#22' })).toBeInTheDocument();
  });

  test('given a PR number chip, when clicked, then window.navigateToPrInTable is called with focusUnsaved', () => {
    const calls = [];
    window.navigateToPrInTable = (...args) => calls.push(args);
    render(<AutoRenderBlockedLinks prNumbers={['15']} authorLogins={[]} />);

    fireEvent.click(screen.getByRole('button', { name: '#15' }));

    expect(calls).toEqual([['15', { focusUnsaved: true }]]);
  });

  test('given author logins, when rendering, then a chip using the resolved display name is shown per author', () => {
    window.getAuthorInsightsDisplayName = (login) => ({ alice: 'Alice A' }[login] || login);
    render(<AutoRenderBlockedLinks prNumbers={[]} authorLogins={['alice']} />);

    expect(screen.getByRole('button', { name: 'Author: Alice A' })).toBeInTheDocument();
  });

  test('given an author chip, when clicked, then window.navigateToAuthorInsights is called with focusUnsaved', () => {
    const calls = [];
    window.getAuthorInsightsDisplayName = (login) => login;
    window.navigateToAuthorInsights = (...args) => calls.push(args);
    render(<AutoRenderBlockedLinks prNumbers={[]} authorLogins={['alice']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Author: alice' }));

    expect(calls).toEqual([['alice', { focusUnsaved: true }]]);
  });

  test('given no window bridges are installed, when rendering and clicking, then nothing throws', () => {
    render(<AutoRenderBlockedLinks prNumbers={['15']} authorLogins={['alice']} />);
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: '#15' }));
      fireEvent.click(screen.getByRole('button', { name: 'Author: alice' }));
    }).not.toThrow();
  });
});
