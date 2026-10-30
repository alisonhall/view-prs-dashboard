/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoRenderBlockingContext, type AutoRenderBlockingValue } from '../../state/AutoRenderBlockingContext';
import { AuthorInsightsContext, defaultAuthorInsights } from '../../state/AuthorInsightsContext';
import { PrDataProvider } from '../../state/PrDataProvider';
import { TabStateProvider } from '../TabStateProvider';
import { AutoUpdatePausedBanner } from './AutoUpdatePausedBanner';

const BLOCKED: AutoRenderBlockingValue = {
  isBlocked: true,
  statusText: 'New data waits for 1 unsaved PR.',
  discardAndApply: () => {},
  blockingPrNumbers: [],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: '',
};

const renderBanner = (state: Partial<AutoRenderBlockingValue> = {}, names: Record<string, string> = {}) =>
  render(
    // The links navigate (to the PR, or the author) through these.
    <PrDataProvider>
      <TabStateProvider>
        <AuthorInsightsContext.Provider
          value={
            {
              ...defaultAuthorInsights,
              getAuthorInsightsDisplayName: (login: string) => names[login] || login,
            } as never
          }
        >
          <AutoRenderBlockingContext.Provider value={{ ...BLOCKED, ...state }}>
            <AutoUpdatePausedBanner />
          </AutoRenderBlockingContext.Provider>
        </AuthorInsightsContext.Provider>
      </TabStateProvider>
    </PrDataProvider>,
  );

const banner = () => screen.getByRole('status', { name: 'Auto update paused' });

describe('AutoUpdatePausedBanner', () => {
  test('is in the page but hidden while nothing is held back', () => {
    renderBanner({ isBlocked: false });
    expect(screen.queryByRole('status', { name: 'Auto update paused' })).not.toBeInTheDocument();
    const live = document.getElementById('auto-render-blocked-indicator');
    expect(live).not.toBeVisible();
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  test('says what is waiting, and "Discard unsaved" drops the edits and shows the new data', async () => {
    const user = userEvent.setup();
    const discardAndApply = jest.fn();
    renderBanner({ discardAndApply });
    expect(banner()).toBeVisible();
    expect(banner()).toHaveTextContent('Auto update paused');
    expect(banner()).toHaveTextContent('New data waits for 1 unsaved PR.');
    await user.click(within(banner()).getByRole('button', { name: 'Discard unsaved' }));
    expect(discardAndApply).toHaveBeenCalledTimes(1);
  });

  test('links each PR with unsaved notes, in a group named by the PR label', () => {
    renderBanner({
      blockingPrNumbers: ['7', '42'],
      blockingPrLabel: 'Blocking PRs: #7, #42',
    });
    const links = within(banner()).getByRole('group', {
      name: 'Blocking PRs: #7, #42',
    });
    expect(within(links).getByRole('button', { name: '#7' })).toBeInTheDocument();
    expect(within(links).getByRole('button', { name: '#42' })).toBeInTheDocument();
  });

  test('links each author with an unsaved draft by name; the group says whose', () => {
    renderBanner({ blockingAuthorInsightsLogins: ['alice', 'bob'] }, { alice: 'Alice A', bob: 'Bob B' });
    const links = within(banner()).getByRole('group', {
      name: 'Blocking author drafts: Alice A, Bob B',
    });
    expect(within(links).getByRole('button', { name: 'Author: Alice A' })).toBeInTheDocument();
  });

  test('has no links group without anything to link', () => {
    renderBanner();
    expect(within(banner()).queryByRole('group')).not.toBeInTheDocument();
  });
});
