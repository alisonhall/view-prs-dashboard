/**
 * AuthorThreadResolutionRuleVisibility - headless component (renders
 * nothing) that owns the "allow"/"deny" <details> dropdowns' hidden/open
 * state next to AuthorThreadResolutionModeSelect.
 *
 * Phase H.7 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces index.page.js's vanilla updateAuthorThreadResolutionRuleVisibility
 * (and its window.updateAuthorThreadResolutionRuleVisibility bridge, called
 * from FilterStateProvider's own mount/change effect and from a delegated
 * native "change" listener) - reads attentionAuthorThreadResolutionMode
 * from FilterStateContext directly instead, same headless-component shape
 * as PrDataPolling.jsx.
 *
 * The 2 <details> elements themselves stay static markup in index.html
 * (not React-rendered): they're also MultiSelectListPortals.jsx's own
 * portal targets, resolved once, synchronously, by react-app.jsx's
 * computeStaticContainers() before this component's own effect ever runs -
 * making them React-rendered here too would mean they don't exist in the
 * DOM yet at that synchronous lookup, permanently breaking those 2
 * checkbox lists. A DOM mutation via a ref-free `getElementById` (same
 * element lookup the old vanilla function did) is the correct scope for
 * this phase - it still fully retires the bridge and the vanilla function,
 * without touching how those lists mount.
 *
 * @module components/AuthorThreadResolutionRuleVisibility
 */

import { useEffect } from 'react';
import { useFilterState } from '../state/FilterStateContext';

export function AuthorThreadResolutionRuleVisibility() {
  const { values } = useFilterState();
  const mode = values.attentionAuthorThreadResolutionMode;

  useEffect(() => {
    const allowOptions = document.getElementById('attention-author-thread-resolution-allow-options');
    if (allowOptions) {
      allowOptions.hidden = mode !== 'allow-only';
      if (mode !== 'allow-only') {
        allowOptions.open = false;
      }
    }

    const denyOptions = document.getElementById('attention-author-thread-resolution-deny-options');
    if (denyOptions) {
      denyOptions.hidden = mode !== 'deny-only';
      if (mode !== 'deny-only') {
        denyOptions.open = false;
      }
    }
  }, [mode]);

  return null;
}
