/**
 * ActorIdentity - Renders a GitHub login as a styled identity element,
 * matching the vanilla renderer's `createActorIdentityElement` output
 * (see helpers/pr-actor-identity-render.helpers.js) so the same CSS
 * (actor-identity, actor-identity-viewer, actor-identity-pr-author) applies.
 *
 * The identity/style *logic* is reused from the vanilla helpers (exposed on
 * window by index.page.js) rather than re-derived here, so behavior can't
 * drift from the vanilla renderer. Only the DOM/JSX construction is React's.
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
