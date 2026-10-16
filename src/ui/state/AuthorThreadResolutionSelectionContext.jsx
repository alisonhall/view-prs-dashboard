import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): checked-state Context for the 2
 * "PR author thread resolution" multi-selects (allow/deny thread-starter
 * lists) - re-investigated from an earlier "genuinely separate concern (a
 * DOM-scan dependency)" deferral and found the DOM-scan dependency itself
 * was real, but only because these 2 lists' checked-state had nowhere else
 * to live (sub-phase 7.4 deliberately left all 4 non-row-filtering
 * multi-selects local-state-only, matching RowFilterSelectionContext.jsx's
 * own comment). This Context is the same fix for these 2 that
 * RowFilterSelectionContext was for the other 5 - a dedicated Context
 * rather than widening that one, since these lists genuinely don't feed
 * row filtering and reusing that Context's name for a different concern
 * would be misleading.
 *
 * `checkedByListId` is a plain object keyed by the 2 list ids
 * (MultiSelectListPortals.jsx's own `MULTI_SELECT_LIST_ID_PREFIXES` keys:
 * `attention-author-thread-resolution-allow-list`/`-deny-list`), each value
 * a `Set<string>` of currently-checked option values.
 */
export const AuthorThreadResolutionSelectionContext = createContext(null);

export function useAuthorThreadResolutionSelection() {
  const context = useContext(AuthorThreadResolutionSelectionContext);
  if (!context) {
    throw new Error(
      'useAuthorThreadResolutionSelection() must be called within a <AuthorThreadResolutionSelectionProvider>',
    );
  }
  return context;
}
