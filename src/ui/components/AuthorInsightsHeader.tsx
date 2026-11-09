/**
 * AuthorInsightsHeader - the selected author at the top of the Authors
 * view: their avatar, display name (with "(you)" for the viewer) and login
 * when it isn't their name, then how many of the stored PRs they've opened
 * are open and merged (useAuthorPickerOptions' activity) and how many
 * comments you've saved about them, once those have loaded. Nothing when
 * no author is selected (the picker clears the selection when there are
 * none).
 *
 * @module components/AuthorInsightsHeader
 */

import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorInsightsDrafts, useAuthorInsightsDraftsVersion } from '../state/AuthorInsightsDraftsContext';
import { useAuthorPickerOptions } from '../state/useAuthorPickerOptions';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.ts';
import { Avatar } from './ui/Avatar';

const { getUserInitials } = createPrUserInitialsHelpers();

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AuthorInsightsHeader() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { resolveActorDisplayName, getEffectiveViewerKey, normalizeActorLogin, loginOfActorKey } = useActorIdentity();
  const { activityByLogin } = useAuthorPickerOptions();
  const drafts = useAuthorInsightsDrafts();
  // Re-renders when the comments load or one is saved.
  useAuthorInsightsDraftsVersion();

  if (!selectedAuthorLogin) {
    return null;
  }

  // The picked author's key (their person's id); their main login shown.
  const login = selectedAuthorLogin;
  const mainLogin = loginOfActorKey(login);
  const name = resolveActorDisplayName(login, payload?.actorsMap || {}) || mainLogin;
  const viewerKey = getEffectiveViewerKey({});
  const isViewer = Boolean(viewerKey) && normalizeActorLogin(login).toLowerCase() === viewerKey;
  const activity = activityByLogin.get(login);
  const counts = [
    count(activity?.open ?? 0, 'open PR', 'open PRs'),
    `${activity?.merged ?? 0} merged`,
    ...(drafts.hasLoadedManualComments(login)
      ? [count(drafts.getManualComments(login).length, 'comment saved', 'comments saved')]
      : []),
  ];

  return (
    <div className="author-insights-selected">
      <Avatar initials={getUserInitials(name, mainLogin)} login={mainLogin} isViewer={isViewer} size="lg" />
      <div className="author-insights-selected-text">
        <p className="author-insights-selected-name">
          {name}
          {isViewer && <span className="author-insights-selected-you"> (you)</span>}
          {name !== mainLogin && <span className="author-insights-selected-login">{mainLogin}</span>}
        </p>
        <ul className="author-insights-selected-counts" aria-label="Counts">
          {counts.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
