import { useEffect } from 'react';

/**
 * Closes every open `<details class="multi-select-dropdown">`
 * (MultiSelectDropdown: the filter bar's and the Settings drawer's lists)
 * when a click lands outside it. AppRoot calls this once.
 *
 * The dropdowns are looked up on each click rather than once at setup:
 * React renders them (some only once the filter options load), so this
 * doesn't depend on running after they exist.
 */
export function useMultiSelectDropdownClosing(): void {
  useEffect(() => {
    const closeOtherDropdowns = (event: MouseEvent) => {
      document.querySelectorAll<HTMLDetailsElement>('.multi-select-dropdown').forEach((dropdown) => {
        if (!dropdown.contains(event.target as Node | null)) {
          dropdown.open = false;
        }
      });
    };
    document.addEventListener('click', closeOtherDropdowns);
    return () => document.removeEventListener('click', closeOtherDropdowns);
  }, []);
}
