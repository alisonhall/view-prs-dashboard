/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ActivityEventsSection } = require('./ActivityEventsSection');

function installDefaultHelpers() {
  window.asArray = (v) => (Array.isArray(v) ? v : []);
  window.buildFallbackActivityEvents = () => [];
  window.buildActivityEventKey = (e) => `${e?.sourceId || ''}|${e?.occurredAt || ''}`;
  window.formatIsoDatetime = (v) => String(v || '-');
  window.normalizePrRootUrl = (url) => String(url || '');
  window.getEffectiveViewerLogin = () => '';
  window.normalizeActorLogin = (v) => String(v || '').trim();
  window.resolveActorDisplayName = (login, _map, fallback) => fallback || login;
  window.buildActorIdentityClassName = () => 'actor-identity';
  window.buildActorIdentityTitle = () => '';
}

function clearHelpers() {
  [
    'asArray',
    'buildFallbackActivityEvents',
    'buildActivityEventKey',
    'formatIsoDatetime',
    'normalizePrRootUrl',
    'getEffectiveViewerLogin',
    'normalizeActorLogin',
    'resolveActorDisplayName',
    'buildActorIdentityClassName',
    'buildActorIdentityTitle',
  ].forEach((key) => delete window[key]);
}

describe('ActivityEventsSection', () => {
  beforeEach(installDefaultHelpers);
  afterEach(clearHelpers);

  test('given no activity events, when rendering, then renders nothing', () => {
    const { container } = render(<ActivityEventsSection pr={{}} actorsMap={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given activity timeline events, when rendering, then shows them newest-first with the actor and description', () => {
    const pr = {
      url: 'https://github.com/o/r/pull/1',
      activityTimeline: [
        {
          events: [
            { sourceId: '1', occurredAt: '2026-01-01T00:00:00Z', actor: 'alice', type: 'comment', channel: 'top-level', body: 'first comment' },
            { sourceId: '2', occurredAt: '2026-01-02T00:00:00Z', actor: 'bob', type: 'approval', channel: 'review' },
          ],
        },
      ],
    };
    render(<ActivityEventsSection pr={pr} actorsMap={{}} />);
    const items = document.querySelectorAll('.insight-list-item');
    expect(items).toHaveLength(2);
    // Newest (bob's approval) first.
    expect(items[0]).toHaveTextContent('bob');
    expect(items[0]).toHaveTextContent('approved');
    expect(items[1]).toHaveTextContent('first comment');
  });

  test('given a commit event with a long message body, when rendering, then truncates it past 280 characters', () => {
    const longBody = 'x'.repeat(300);
    const pr = {
      activityTimeline: [
        {
          events: [
            { sourceId: '1', occurredAt: '2026-01-01T00:00:00Z', actor: 'alice', type: 'commit', channel: 'commit', messageHeadline: 'A commit', messageBody: longBody },
          ],
        },
      ],
    };
    render(<ActivityEventsSection pr={pr} actorsMap={{}} />);
    expect(screen.getByText(`${'x'.repeat(280)}…`)).toBeInTheDocument();
  });
});
