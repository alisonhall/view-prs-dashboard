import { createContext, useContext } from 'react';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.js';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.js';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.js';

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): actor-identity
 * resolution (login normalization/aliasing, display-name lookup, viewer/
 * PR-author badge styling) used to be a set of ~8 window.* bridges
 * (window.normalizeActorLogin, window.resolveActorDisplayName, etc.)
 * assigned by index.page.js from its own DI-wired closures. Since the
 * underlying logic is genuinely pure once given a viewer-alias map and a
 * "current viewer login" - both derivable straight from the PR payload
 * (see PrDataProvider.jsx's viewerContext memo) - it's now computed inside
 * React itself and threaded through this dedicated Context instead.
 *
 * The default value (factories called with no arguments, i.e. no known
 * viewer/aliases) intentionally matches the permissive fallback every
 * consuming component used to inline as `window.x || (...) => ...` - so a
 * component rendered without a <PrDataProvider> ancestor (most existing
 * unit tests) still gets sane, viewer-unaware behavior with no wrapping
 * required.
 */
export const defaultActorIdentity = {
  ...createPrActorIdentityHelpers(),
  ...createPrActorIdentityRenderHelpers(),
  ...createPrActorIdentityStyleHelpers(),
};

export const ActorIdentityContext = createContext(defaultActorIdentity);

export function useActorIdentity() {
  return useContext(ActorIdentityContext);
}
