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
  test('selects the person by their key and shows the Authors view', () => {
    const setActiveDataTab = jest.fn();
    const { container } = render(
      <TabStateContext.Provider value={{ setActiveDataTab } as unknown as TabStateValue}>
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
      expect(openAuthor('Octocat', 'The Octocat')).toBe(true);
    });
    expect(setActiveDataTab).toHaveBeenCalledWith('author-insights');
    expect(container.querySelector('output')).toHaveTextContent('person:octocat');
  });

  test('does nothing without a person', () => {
    const handler = jest.fn();
    window.addEventListener('view-prs-open-author', handler);
    expect(openAuthor('', '')).toBe(false);
    window.removeEventListener('view-prs-open-author', handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
