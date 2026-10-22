import { useEffect } from 'react';

/**
 * Window-bridge elimination Phase 7.5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * closes every open `<details class="multi-select-dropdown">` (the Run &
 * Filter tab's checkbox-list filters) when a click lands outside it.
 * Replaces pr-filter-panel.helpers.js's setupMultiSelectDropdownClosing,
 * which index.page.js called once at startup; AppRoot calls this hook.
 *
 * The dropdowns are looked up on each click rather than once at setup. All
 * 9 are static index.html markup, so that's the same set the old code saw;
 * it just no longer depends on running after they exist.
 */
export function useMultiSelectDropdownClosing() {
  useEffect(() => {
    const closeOtherDropdowns = (event) => {
      document.querySelectorAll('.multi-select-dropdown').forEach((dropdown) => {
        if (!dropdown.contains(event.target)) {
          dropdown.open = false;
        }
      });
    };
    document.addEventListener('click', closeOtherDropdowns);
    return () => document.removeEventListener('click', closeOtherDropdowns);
  }, []);
}
