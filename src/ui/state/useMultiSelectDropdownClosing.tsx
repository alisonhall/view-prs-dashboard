import { useEffect } from 'react';

/**
 * Closes every open `<details class="multi-select-dropdown">` (the Run &
 * Filter tab's checkbox-list filters) when a click lands outside it.
 * AppRoot calls this once.
 *
 * The dropdowns are looked up on each click rather than once at setup. All
 * 9 are static index.html markup, so the set never changes; looking them up
 * per click just doesn't depend on running after they exist.
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
