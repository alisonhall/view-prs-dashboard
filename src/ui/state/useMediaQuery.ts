import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query matches, kept up to date as the window
 * changes (the detail pane docks on wide screens and becomes an overlay
 * drawer below 900px). False where matchMedia doesn't exist (some test
 * environments).
 */
const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;

export function useMediaQuery(query: string): boolean {
  const [isMatch, setIsMatch] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const update = () => setIsMatch(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return isMatch;
}
