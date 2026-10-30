/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ActivityEventDescription } = require('./ActivityEventDescription');
const { ActorIdentityContext, defaultActorIdentity } = require('../../state/ActorIdentityContext');

describe('ActivityEventDescription', () => {
  test.each([
    ['approval', {}, 'approved'],
    ['review', { state: 'CHANGES_REQUESTED' }, 'requested changes'],
    ['review', { state: 'COMMENTED' }, 'reviewed'],
    ['review', { state: 'DISMISSED' }, 'had a review dismissed'],
    ['review', {}, 'reviewed'],
    ['comment', { channel: 'thread' }, 'commented in a thread'],
    ['comment', { channel: 'top-level' }, 'commented'],
    ['commit', {}, 'pushed a commit'],
    ['opened', {}, 'opened the PR'],
    ['merged', {}, 'merged the PR'],
    ['closed', {}, 'closed the PR'],
    ['something-else', {}, 'something-else'],
  ])('given a %s event, when rendering, then it reads "alice <action>"', (type, extra, expectedAction) => {
    render(<ActivityEventDescription event={{ type, actor: 'alice', ...extra }} row={{}} actorsMap={{}} />);
    expect(screen.getByText('alice').parentElement).toHaveTextContent(`alice ${expectedAction}`);
  });

  test.each([
    ['merged', 'PR merged'],
    ['closed', 'PR closed'],
    ['opened', 'PR opened'],
  ])('given a %s event with no known actor, then it reads "%s"', (type, expected) => {
    const { container } = render(<ActivityEventDescription event={{ type, actor: 'unknown' }} row={{}} actorsMap={{}} />);
    expect(container).toHaveTextContent(expected);
  });

  test('given an actor login, when rendering, then renders it via ActorIdentity', () => {
    render(
      <ActorIdentityContext.Provider
        value={{ ...defaultActorIdentity, resolveActorDisplayName: (login) => `Display(${login})` }}
      >
        <ActivityEventDescription event={{ type: 'approval', actor: 'octocat' }} row={{}} actorsMap={{}} />
      </ActorIdentityContext.Provider>,
    );
    expect(screen.getByText('Display(octocat)')).toBeInTheDocument();
  });
});
