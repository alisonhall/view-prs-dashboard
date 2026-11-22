/** @jest-environment jsdom */

import { act, render } from '@testing-library/react';
import { PrDataProvider } from './PrDataProvider';
import { usePrData } from './PrDataContext';
import { ActorIdentityContext, defaultActorIdentity } from './ActorIdentityContext';
import { TabStateContext, type TabStateValue } from './TabStateContext';
import { OpenAuthorListener, openAuthor } from './useOpenAuthor';

function SelectedAuthor() {
  return <output>{usePrData().selectedAuthorLogin}</output>;
}

describe('openAuthor and OpenAuthorListener', () => {
  test('selects the person by their key, shows the Authors view, and remembers the view it was opened from for the Back bar', () => {
    const setActiveDataTab = jest.fn();
    const rememberReturnTarget = jest.fn();
    const from = document.createElement('button');
    const { container } = render(
      <TabStateContext.Provider value={{ activeDataTab: 'pr-data', setActiveDataTab, rememberReturnTarget } as unknown as TabStateValue}>
        <PrDataProvider initialPayload={{ byPrNumber: {} }}>
          <ActorIdentityContext.Provider
            value={{ ...defaultActorIdentity, getPreferredActorKey: (login: unknown) => `person:${String(login).toLowerCase()}` }}
          >
            <OpenAuthorListener />
            <SelectedAuthor />
          </ActorIdentityContext.Provider>
        </PrDataProvider>
      </TabStateContext.Provider>,
    );

    act(() => {
      expect(openAuthor('Octocat', 'The Octocat', from)).toBe(true);
    });
    expect(rememberReturnTarget).toHaveBeenCalledWith(
      expect.objectContaining({ tab: 'pr-data', shownIn: 'author-insights', subject: 'The Octocat', focusTarget: from }),
    );
    expect(setActiveDataTab).toHaveBeenCalledWith('author-insights');
    expect(container.querySelector('output')).toHaveTextContent('person:octocat');
  });

  test('opened from the Authors view itself, it keeps the Back bar it has rather than pointing back at Authors', () => {
    const rememberReturnTarget = jest.fn();
    render(
      <TabStateContext.Provider value={{ activeDataTab: 'author-insights', setActiveDataTab: () => {}, rememberReturnTarget } as unknown as TabStateValue}>
        <PrDataProvider initialPayload={{ byPrNumber: {} }}>
          <OpenAuthorListener />
        </PrDataProvider>
      </TabStateContext.Provider>,
    );
    act(() => {
      openAuthor('hubot', 'Hubot');
    });
    expect(rememberReturnTarget).not.toHaveBeenCalled();
  });

  test('does nothing without a person', () => {
    const handler = jest.fn();
    window.addEventListener('view-prs-open-author', handler);
    expect(openAuthor('', '')).toBe(false);
    window.removeEventListener('view-prs-open-author', handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
