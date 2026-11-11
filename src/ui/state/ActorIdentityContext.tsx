import { createContext, useContext } from 'react';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.ts';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.ts';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.ts';

/**
 * Actor-identity resolution for the whole UI: each login's person (their
 * key - their id, Settings › People), their logins, display names, the
 * viewer's own login and key, and the viewer/PR-author badge styling.
 * PrDataProvider provides it, wired to the payload's people and current
 * viewer (see its viewerContext memo).
 *
 * The default value (factories called with no arguments, i.e. no known
 * viewer/aliases) is permissive and viewer-unaware, so a component
 * rendered without a <PrDataProvider> ancestor (most unit tests) still
 * gets sane behavior with no wrapping required.
 */
export type ActorIdentityValue = ReturnType<typeof createPrActorIdentityHelpers> &
  Pick<ReturnType<typeof createPrActorIdentityRenderHelpers>, 'getEffectiveViewerLogin' | 'getEffectiveViewerKey'> &
  ReturnType<typeof createPrActorIdentityStyleHelpers>;

export const defaultActorIdentity: ActorIdentityValue = {
  ...createPrActorIdentityHelpers(),
  ...createPrActorIdentityRenderHelpers(),
  ...createPrActorIdentityStyleHelpers(),
};

export const ActorIdentityContext = createContext<ActorIdentityValue>(defaultActorIdentity);

export function useActorIdentity(): ActorIdentityValue {
  return useContext(ActorIdentityContext);
}
