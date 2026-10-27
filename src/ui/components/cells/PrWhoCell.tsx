import { useMemo } from 'react';
import type { PrData } from '../../types/pr-data.ts';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { useNeedsAttention } from '../../state/NeedsAttentionContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { createPrAuthorCellHelpers } from '../../helpers/pr-author-cell.helpers.ts';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';

/**
 * The Who column: the PR author's avatar, plus "+N" for anyone else with
 * non-merge commits (the old Author column listed them all). Names are in
 * the tooltip and the accessible name.
 */
export interface PrWhoCellProps {
  pr: PrData;
  actorsMap?: ActorsMap;
}

export function PrWhoCell({ pr, actorsMap = {} }: PrWhoCellProps) {
  const { getPreferredActorKey, resolveActorDisplayName, getEffectiveViewerLogin } = useActorIdentity();
  const { getUserInitials } = usePrInsightsDisplay();
  const { mergeCommitRules } = useNeedsAttention().attentionConfig;
  // The real, alias-resolving getPreferredActorKey, so a co-author who's
  // an alias of the PR author is deduped (as the old Author column did).
  const { collectPrAuthors } = useMemo(
    () => createPrAuthorCellHelpers({ getPreferredActorKey, mergeCommitRules }),
    [getPreferredActorKey, mergeCommitRules],
  );

  const authors = collectPrAuthors(pr).map((author) => ({
    ...author,
    displayName: resolveActorDisplayName(author.key, actorsMap, author.name) || author.key,
  }));
  const [primary, ...others] = authors;
  if (!primary) {
    return (
      <td className="pr-cell pr-cell-who">
        <span className="pr-who-unknown">–</span>
      </td>
    );
  }

  const viewerLogin = String(getEffectiveViewerLogin(pr) || '').toLowerCase();
  const isViewer = (login: string) => Boolean(viewerLogin) && login.toLowerCase() === viewerLogin;
  const name = `Author: ${primary.displayName}${isViewer(primary.key) ? ' (you)' : ''}`;
  const label = others.length
    ? `${name}\nAlso committed: ${others.map((other) => other.displayName).join(', ')}`
    : name;

  return (
    <td className="pr-cell pr-cell-who">
      <Tooltip content={label} focusTarget>
        <span className="pr-who" role="img" aria-label={name}>
          <Avatar initials={getUserInitials(primary.displayName, primary.key)} login={primary.key} isViewer={isViewer(primary.key)} />
          {others.length > 0 && (
            <span className="pr-who-more" aria-hidden="true">
              +{others.length}
            </span>
          )}
        </span>
      </Tooltip>
    </td>
  );
}
