import { useContext, useMemo } from 'react';
import { FilterStateContext } from './FilterStateContext';
import { AuthorThreadResolutionSelectionContext } from './AuthorThreadResolutionSelectionContext';
import type { ThreadResolutionPolicy } from '../helpers/pr-review-threads.helpers.ts';

/**
 * The "PR author thread resolution" rule (Advanced visibility and attention
 * rules) for the Conversations tab: its mode and the allow/deny lists'
 * checked logins.
 *
 * Reads both Contexts directly (not their throwing hooks), with the same
 * permissive "allow-all, nothing checked" defaults, so the tab works
 * without those Providers (component tests).
 *
 * `mode` falls back to a plain DOM read of the real
 * `<select id="attention-author-thread-resolution-mode">` when no
 * FilterStateContext value is available:
 * integration-tests/index.html.test.js's harness never mounts a real
 * <FilterStateProvider>, so the mode select there is the plain <select>
 * from the static index.html, read and written directly as a DOM element.
 * Without this fallback the mode would stay "allow-all" there regardless of
 * what the test selects. (Moved from ReviewThreadsSection.jsx.)
 */
const normalizeMode = (value: unknown): ThreadResolutionPolicy['mode'] => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'allow-only' || normalized === 'deny-only' ? normalized : 'allow-all';
};

const toLoginKeySet = (values: Iterable<unknown> | undefined): Set<string> =>
  new Set(Array.from(values || []).map((value) => String(value || '').trim().toLowerCase()));

export function useAuthorThreadResolutionPolicy(): ThreadResolutionPolicy {
  const filterState = useContext(FilterStateContext);
  const selection = useContext(AuthorThreadResolutionSelectionContext);
  const domMode =
    typeof document !== 'undefined'
      ? (document.getElementById('attention-author-thread-resolution-mode') as HTMLSelectElement | null)?.value
      : undefined;
  const mode = normalizeMode(filterState?.values?.attentionAuthorThreadResolutionMode ?? domMode);
  // `selection` itself is stable unless the Provider's state changes; a
  // fallback object built here would be new on every render.
  const checkedByListId = selection?.checkedByListId;

  return useMemo(
    () => ({
      mode,
      allowLoginKeys: toLoginKeySet(checkedByListId?.['attention-author-thread-resolution-allow-list']),
      denyLoginKeys: toLoginKeySet(checkedByListId?.['attention-author-thread-resolution-deny-list']),
    }),
    [mode, checkedByListId],
  );
}
