/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ActivityEventDescription } = require('./ActivityEventDescription');

function installDefaultHelpers() {
  window.normalizeActorLogin = (v) => String(v || '').trim();
  window.getEffectiveViewerLogin = () => '';
  window.resolveActorDisplayName = (login, _map, fallback) => fallback || login || '';
  window.buildActorIdentityClassName = () => 'actor-identity';
  window.buildActorIdentityTitle = () => '';
}

function clearHelpers() {
  ['normalizeActorLogin', 'getEffectiveViewerLogin', 'resolveActorDisplayName', 'buildActorIdentityClassName', 'buildActorIdentityTitle'].forEach(
    (key) => delete window[key],
  );
}

describe('ActivityEventDescription', () => {
  beforeEach(installDefaultHelpers);
  afterEach(clearHelpers);

  test.each([
    ['approval', {}, 'approved'],
    ['review', { state: 'CHANGES_REQUESTED' }, 'review (CHANGES_REQUESTED)'],
    ['review', {}, 'review'],
    ['comment', { channel: 'thread' }, 'thread comment'],
    ['comment', { channel: 'top-level' }, 'comment'],
    ['commit', {}, 'commit'],
    ['opened', {}, 'opened PR'],
    ['merged', {}, 'merged PR'],
    ['something-else', {}, 'something-else'],
  ])('given a %s event, when rendering, then the suffix is "%s"', (type, extra, expectedSuffix) => {
    render(<ActivityEventDescription event={{ type, actor: 'alice', ...extra }} row={{}} actorsMap={{}} />);
    expect(screen.getByText('alice').parentElement).toHaveTextContent(`alice ${expectedSuffix}`);
  });

  test('given an actor login, when rendering, then renders it via ActorIdentity', () => {
    window.resolveActorDisplayName = (login) => `Display(${login})`;
    render(<ActivityEventDescription event={{ type: 'approval', actor: 'octocat' }} row={{}} actorsMap={{}} />);
    expect(screen.getByText('Display(octocat)')).toBeInTheDocument();
  });
});
