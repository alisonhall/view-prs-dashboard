/** @jest-environment jsdom */

import { act, render } from '@testing-library/react';
import { CustomSectionMembershipProvider, useCustomSectionMembership, type CustomSectionMembershipValue } from './CustomSectionMembership';
import { PrSectionPreferencesContext, type PrSectionPreferencesValue } from './PrSectionPreferencesProvider';
import { PrDataContext } from './PrDataContext';
import { PrDataActionsContext } from './PrDataActionsContext';
import { SnackbarContext } from './SnackbarContext';
import type { PrDataPayload } from '../types/pr-data';

const blockers = { id: 'abc', name: 'Blockers', icon: 'flag' as const, tone: 'danger' as const };
// The same sections each render, as the provider gives them until they change.
const preferences = { customSections: [blockers] } as unknown as PrSectionPreferencesValue;

describe('CustomSectionMembershipProvider', () => {
  let seen: CustomSectionMembershipValue[];
  const Probe = () => {
    seen.push(useCustomSectionMembership());
    return null;
  };
  const latest = (): CustomSectionMembershipValue => seen[seen.length - 1] as CustomSectionMembershipValue;
  const actions = { loadStoredData: jest.fn(), applyFreshPrPayload: jest.fn(), applyLatestPrData: jest.fn(), getLatestStoredPayload: jest.fn() };
  const showError = jest.fn();
  const tree = (payload: Partial<PrDataPayload>) => (
    <PrSectionPreferencesContext.Provider value={preferences}>
      <PrDataContext.Provider value={{ payload } as never}>
        <PrDataActionsContext.Provider value={actions}>
          <SnackbarContext.Provider value={{ showError, showWarning: jest.fn() } as never}>
            <CustomSectionMembershipProvider>
              <Probe />
            </CustomSectionMembershipProvider>
          </SnackbarContext.Provider>
        </PrDataActionsContext.Provider>
      </PrDataContext.Provider>
    </PrSectionPreferencesContext.Provider>
  );

  beforeEach(() => {
    seen = [];
    jest.clearAllMocks();
  });

  test("gives the sections and the ones a PR is in, and keeps the same value when a poll brings an unchanged copy", () => {
    const view = render(tree({ customSectionsByRepo: { 'acme/app': { 7: ['abc'] } } }));
    expect(latest().sections).toEqual([blockers]);
    expect(latest().idsFor('acme/app', '7')).toEqual(['abc']);
    expect(latest().idsFor('acme/app', '8')).toEqual([]);
    const first = latest();

    view.rerender(tree({ customSectionsByRepo: { 'acme/app': { 7: ['abc'] } } }));
    expect(latest()).toBe(first);

    view.rerender(tree({ customSectionsByRepo: { 'acme/app': { 7: [], 8: ['abc'] } } }));
    expect(latest()).not.toBe(first);
    expect(latest().idsFor('acme/app', '8')).toEqual(['abc']);
  });

  test('adding a PR saves it and puts the answer on the page', async () => {
    const answer = { 'acme/app': { 7: ['abc'] } };
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, customSectionsByRepo: answer }) })) as never;
    actions.getLatestStoredPayload.mockReturnValue({ byPrNumber: { x: {} }, customSectionsByRepo: {} });
    render(tree({}));

    await act(() => latest().setMember(blockers, 'acme/app', '7', true));

    expect(global.fetch).toHaveBeenCalledWith('/view-prs/custom-section-prs', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ sectionId: 'abc', repo: 'acme/app', prNumber: '7', member: true });
    expect(actions.applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { x: {} }, customSectionsByRepo: answer });
    expect(showError).not.toHaveBeenCalled();
  });

  test("a failure says so and leaves the page's data as it was", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: 'Disk full' }) })) as never;
    render(tree({}));

    await act(() => latest().setMember(blockers, 'acme/app', '7', false));

    expect(showError).toHaveBeenCalledWith('Taking PR #7 out of Blockers failed', 'Disk full');
    expect(actions.applyFreshPrPayload).not.toHaveBeenCalled();
  });
});
