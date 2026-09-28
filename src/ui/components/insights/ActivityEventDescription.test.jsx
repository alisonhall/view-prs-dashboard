/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ActivityEventDescription } = require('./ActivityEventDescription');
const { ActorIdentityContext, defaultActorIdentity } = require('../../state/ActorIdentityContext');

describe('ActivityEventDescription', () => {
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
