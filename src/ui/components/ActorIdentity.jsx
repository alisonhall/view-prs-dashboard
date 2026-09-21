/**
 * ActorIdentity - Renders a GitHub login as a styled identity element,
 * using the same CSS (actor-identity, actor-identity-viewer,
 * actor-identity-pr-author) the vanilla renderer this component replaced
 * used to build directly via DOM APIs (that vanilla builder,
 * `createActorIdentityElement`, was deleted once this component fully
 * superseded it - see REACT_MIGRATION_PLAN.md's 2026-09-20 entry).
 *
 * The viewer-login resolution and class/title *logic* are still reused
 * from the vanilla helpers (exposed on window by index.page.js) -
 * `getEffectiveViewerLogin` (helpers/pr-actor-identity-render.helpers.js)
 * and `buildActorIdentityClassName`/`buildActorIdentityTitle`
 * (helpers/pr-actor-identity-style.helpers.js) - so behavior can't drift.
 * The isViewer/isPrAuthor comparison itself is a plain inline equality
 * check below, matching what the vanilla renderer's own identity-state
 * step used to compute.
 *
 * @module components/ActorIdentity
 */

import React from 'react';

export function ActorIdentity({ row, login, actorsMap = {}, fallbackName = '', className = '', as: Tag = 'span' }) {
  const normalizeActorLogin = window.normalizeActorLogin || ((value) => String(value || '').trim());
  const getEffectiveViewerLogin = window.getEffectiveViewerLogin || (() => '');
  const resolveActorDisplayName =
    window.resolveActorDisplayName || ((value, _actorsMap, fallback) => String(fallback || value || '').trim());
  const buildActorIdentityClassName =
    window.buildActorIdentityClassName ||
    (({ className: extra = '' } = {}) => ['actor-identity', extra].filter(Boolean).join(' '));
  const buildActorIdentityTitle = window.buildActorIdentityTitle || (() => '');

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
