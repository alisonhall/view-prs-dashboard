/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrSectionPreferencesContext, type PrSectionPreferencesValue } from '../state/PrSectionPreferencesProvider';
import type { PrSectionPreferences } from '../helpers/pr-section-preferences.helpers.ts';
import { PrSectionSortMenu } from './PrSectionSortMenu';

const renderMenu = (sectionKey: string, sectionTitle: string, preferences: PrSectionPreferences = {}) => {
  const setSectionSort = jest.fn();
  const value = {
    preferences,
    isReady: true,
    setSectionHidden: jest.fn(),
    setSectionStartsOpen: jest.fn(),
    setSectionSort,
    setSectionLook: jest.fn(),
    resetSections: jest.fn(),
    groupByRepo: false,
    setGroupByRepo: jest.fn(),
    sectionOrder: [],
    moveSection: jest.fn(),
    customSections: [],
    catalog: [],
    addCustomSection: jest.fn(),
    updateCustomSection: jest.fn(),
    removeCustomSection: jest.fn(),
  } as PrSectionPreferencesValue;
  render(
    <PrSectionPreferencesContext.Provider value={value}>
      <PrSectionSortMenu sectionKey={sectionKey} sectionTitle={sectionTitle} />
    </PrSectionPreferencesContext.Provider>,
  );
  return setSectionSort;
};

describe('PrSectionSortMenu', () => {
  test("its button says the section's sort, and its menu offers the section's own date, the current choices checked", async () => {
    const user = userEvent.setup();
    renderMenu('merged', 'Latest Merged PRs');

    await user.click(screen.getByRole('button', { name: 'Sort Latest Merged PRs: Date merged, newest first' }));

    expect(screen.getAllByRole('menuitemradio').map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['PR number', 'false'],
      ['Last updated', 'false'],
      ['Date merged', 'true'],
      ['Newest first', 'true'],
      ['Oldest first', 'false'],
    ]);
  });

  test('choosing what to sort by keeps the direction; choosing a direction keeps what it sorts by', async () => {
    const user = userEvent.setup();
    const setSectionSort = renderMenu('open', 'Open PRs', { open: { sort: { by: 'number', direction: 'asc' } } });
    const button = screen.getByRole('button', { name: 'Sort Open PRs: PR number, lowest first' });

    await user.click(button);
    await user.click(screen.getByRole('menuitemradio', { name: 'Last updated' }));
    expect(setSectionSort).toHaveBeenLastCalledWith('open', { by: 'updated', direction: 'asc' });

    await user.click(button);
    await user.click(screen.getByRole('menuitemradio', { name: 'Highest first' }));
    expect(setSectionSort).toHaveBeenLastCalledWith('open', { by: 'number', direction: 'desc' });
  });
});
