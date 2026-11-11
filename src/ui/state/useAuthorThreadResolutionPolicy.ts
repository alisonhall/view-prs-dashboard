import { useContext, useMemo } from 'react';
import { useActorIdentity } from './ActorIdentityContext';
import { FilterStateContext } from './FilterStateContext';
import { AuthorThreadResolutionSelectionContext } from './AuthorThreadResolutionSelectionContext';
import type { ThreadResolutionPolicy } from '../helpers/pr-review-threads.helpers.ts';
import { repoRulesFor } from '../helpers/repo-rules.helpers.ts';

/**
 * The "PR author thread resolution" rule (Advanced visibility and attention
 * rules) for the Conversations tab: its mode and the allow/deny lists'
 * picks, as every login of each person picked (lower-cased) - the threads'
 * starters are compared as GitHub gives them.
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


// `repo`: the PR's - its own policy and lists when it has them (Settings ›
// Rules for a repo, repo-rules.helpers.ts), else the ones for every repo.
export function useAuthorThreadResolutionPolicy(repo = ''): ThreadResolutionPolicy {
  const filterState = useContext(FilterStateContext);
  const selection = useContext(AuthorThreadResolutionSelectionContext);
  const domMode =
    typeof document !== 'undefined'
      ? (document.getElementById('attention-author-thread-resolution-mode') as HTMLSelectElement | null)?.value
      : undefined;
  const own = repoRulesFor(filterState?.values?.repoRules, repo).threadResolution;
  const mode = normalizeMode(own ? own.mode : (filterState?.values?.attentionAuthorThreadResolutionMode ?? domMode));
  // `selection` itself is stable unless the Provider's state changes; a
  // fallback object built here would be new on every render.
  const checkedByListId = selection?.checkedByListId;
  const allowPicks = own ? own.allow : checkedByListId?.['attention-author-thread-resolution-allow-list'];
  const denyPicks = own ? own.deny : checkedByListId?.['attention-author-thread-resolution-deny-list'];
  const { loginsOfActorKey } = useActorIdentity();

  return useMemo(() => {
    // A pick is a person's id (or a login saved before ids): every login
    // that's theirs.
    const toLoginKeySet = (values: Iterable<unknown> | undefined): Set<string> =>
      new Set(
        Array.from(values || []).flatMap((value) => loginsOfActorKey(value).map((login) => login.trim().toLowerCase())),
      );
    return {
      mode,
      allowLoginKeys: toLoginKeySet(allowPicks),
      denyLoginKeys: toLoginKeySet(denyPicks),
    };
  }, [mode, allowPicks, denyPicks, loginsOfActorKey]);
}
