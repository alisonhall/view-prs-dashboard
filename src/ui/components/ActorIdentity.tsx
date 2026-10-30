/**
 * ActorIdentity - Renders a GitHub login as a styled identity element,
 * using the same CSS (actor-identity, actor-identity-viewer,
 * actor-identity-pr-author) the vanilla renderer this component replaced
 * used to build directly via DOM APIs (that vanilla builder,
 * `createActorIdentityElement`, was deleted once this component fully
 * superseded it - see REACT_MIGRATION_PLAN.md's 2026-09-20 entry).
 *
 * The viewer-login resolution and class/title *logic* come from
 * useActorIdentity() (state/ActorIdentityContext.tsx) - `getEffectiveViewerLogin`
 * (helpers/pr-actor-identity-render.helpers.ts) and
 * `buildActorIdentityClassName`/`buildActorIdentityTitle`
 * (helpers/pr-actor-identity-style.helpers.ts) - so behavior can't drift.
 * The isViewer/isPrAuthor comparison itself is a plain inline equality
 * check below, matching what the vanilla renderer's own identity-state
 * step used to compute.
 *
 * @module components/ActorIdentity
 */

import { useActorIdentity } from '../state/ActorIdentityContext';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import type { PrData } from '../types/pr-data.ts';

export interface ActorIdentityProps {
  // The PR the actor appears on: says whether they're its author, and who
  // the viewer is.
  row?: PrData | null;
  login: string | null | undefined;
  actorsMap?: ActorsMap;
  fallbackName?: string;
  className?: string;
  as?: 'span' | 'div';
}

export function ActorIdentity({ row, login, actorsMap = {}, fallbackName = '', className = '', as: Tag = 'span' }: ActorIdentityProps) {
  const {
    normalizeActorLogin,
    getEffectiveViewerLogin,
    resolveActorDisplayName,
    buildActorIdentityClassName,
    buildActorIdentityTitle,
  } = useActorIdentity();

  const normalizedLogin = normalizeActorLogin(login).toLowerCase();
  if (!normalizedLogin) {
    return <Tag className={buildActorIdentityClassName({ identityState: {}, className })}>-</Tag>;
  }

  const viewerLogin = getEffectiveViewerLogin(row || {});
  const authorLogin = normalizeActorLogin(row?.authorLogin || row?.author || '').toLowerCase();
  const identityState = {
    normalizedLogin,
    isViewer: Boolean(viewerLogin) && normalizedLogin === viewerLogin,
    isPrAuthor: Boolean(authorLogin) && normalizedLogin === authorLogin,
  };

  const displayName = resolveActorDisplayName(login, actorsMap, fallbackName);
  const identityClassName = buildActorIdentityClassName({ identityState, className });
  const title = buildActorIdentityTitle(identityState) || undefined;

  return (
    <Tag className={identityClassName} title={title}>
      {displayName}
    </Tag>
  );
}
