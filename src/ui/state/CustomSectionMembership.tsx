import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { usePrSectionPreferences } from './PrSectionPreferencesProvider';
import { useOptionalPrData } from './PrDataContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useRequestActivity } from './RequestActivityContext';
import { useSnackbar } from './SnackbarContext';
import { customSectionIdsFor, type CustomSection } from '../helpers/pr-custom-sections.helpers.ts';
import { postJson } from '../helpers/pr-http.helpers.ts';
import type { PrDataPayload } from '../types/pr-data.ts';

/**
 * The custom sections and which PRs are in each, for the rows' More
 * actions (PrActionsCell): `idsFor` gives a PR's sections' ids, and
 * `setMember` adds a PR to one or takes it out (POST
 * /view-prs/custom-section-prs), putting the answer on the page.
 *
 * Its own Context, with a value that changes only when the sections or
 * their PRs do - not on every poll, as the payload does - so the rows'
 * menus don't all re-render each time the data updates.
 */
export interface CustomSectionMembershipValue {
  sections: CustomSection[];
  idsFor: (repo: string, prNumber: string) => string[];
  setMember: (section: CustomSection, repo: string, prNumber: string, member: boolean) => Promise<void>;
}

const NO_IDS: string[] = [];

export const CustomSectionMembershipContext = createContext<CustomSectionMembershipValue>({
  sections: [],
  idsFor: () => NO_IDS,
  setMember: async () => {},
});

export const useCustomSectionMembership = () => useContext(CustomSectionMembershipContext);

interface MembershipRouteResult {
  ok?: boolean;
  error?: string;
  customSectionsByRepo?: PrDataPayload['customSectionsByRepo'];
}

export function CustomSectionMembershipProvider({ children }: { children: ReactNode }) {
  const { customSections } = usePrSectionPreferences();
  // Compared as text: each poll brings a new copy of the same map.
  const byRepoText = JSON.stringify(useOptionalPrData()?.payload?.customSectionsByRepo || {});
  const byRepo = useMemo(() => JSON.parse(byRepoText) as PrDataPayload['customSectionsByRepo'], [byRepoText]);
  const { getLatestStoredPayload, applyFreshPrPayload } = usePrDataActions();
  const { beginRequestActivity } = useRequestActivity();
  const { showError } = useSnackbar();

  const idsFor = useCallback((repo: string, prNumber: string) => customSectionIdsFor(byRepo, repo, prNumber), [byRepo]);
  const setMember = useCallback(
    async (section: CustomSection, repo: string, prNumber: string, member: boolean) => {
      const what = member ? `Adding PR #${prNumber} to ${section.name}` : `Taking PR #${prNumber} out of ${section.name}`;
      const finishActivity = beginRequestActivity('customSection');
      try {
        const { response, result } = await postJson<MembershipRouteResult>('/view-prs/custom-section-prs', {
          sectionId: section.id,
          repo,
          prNumber,
          member,
        });
        if (!response.ok || result.ok === false || !result.customSectionsByRepo) {
          showError(`${what} failed`, result.error || `The server answered ${response.status}.`);
          return;
        }
        const latest = getLatestStoredPayload();
        if (latest) applyFreshPrPayload({ ...latest, customSectionsByRepo: result.customSectionsByRepo });
      } catch (error) {
        showError(`${what} failed`, error instanceof Error ? error.message : String(error));
      } finally {
        finishActivity();
      }
    },
    [beginRequestActivity, getLatestStoredPayload, applyFreshPrPayload, showError],
  );

  const value = useMemo(() => ({ sections: customSections, idsFor, setMember }), [customSections, idsFor, setMember]);
  return <CustomSectionMembershipContext.Provider value={value}>{children}</CustomSectionMembershipContext.Provider>;
}
