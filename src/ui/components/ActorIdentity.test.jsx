/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ActorIdentity } = require('./ActorIdentity');

describe('ActorIdentity', () => {
  beforeEach(() => {
    delete window.normalizeActorLogin;
    delete window.getEffectiveViewerLogin;
    delete window.resolveActorDisplayName;
    delete window.buildActorIdentityClassName;
    delete window.buildActorIdentityTitle;
  });

  test('given no window helpers installed, when rendering a login, then falls back to the raw login text', () => {
    render(<ActorIdentity login="octocat" row={{}} />);
    expect(screen.getByText('octocat')).toBeInTheDocument();
  });

  test('given an empty login, when rendering, then shows a dash', () => {
    render(<ActorIdentity login="" row={{}} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  test('given the viewer identity helpers, when the login matches the viewer, then applies the viewer class and title', () => {
    window.normalizeActorLogin = (value) => String(value || '').trim();
    window.getEffectiveViewerLogin = () => 'octocat';
    window.resolveActorDisplayName = (login) => `Display(${login})`;
    window.buildActorIdentityClassName = ({ identityState, className }) =>
      ['actor-identity', className, identityState.isViewer ? 'actor-identity-viewer' : '']
        .filter(Boolean)
        .join(' ');
    window.buildActorIdentityTitle = ({ isViewer }) => (isViewer ? 'Current user' : '');

    render(<ActorIdentity login="octocat" row={{}} className="author-cell-name" />);

    const el = screen.getByText('Display(octocat)');
    expect(el).toHaveClass('actor-identity', 'author-cell-name', 'actor-identity-viewer');
    expect(el).toHaveAttribute('title', 'Current user');
  });

  test('given an `as` prop, when rendering, then uses that tag name', () => {
    window.normalizeActorLogin = (value) => String(value || '').trim();
    render(<ActorIdentity login="octocat" row={{}} as="div" />);
    expect(screen.getByText('octocat').tagName).toBe('DIV');
  });
});
