import { useMemo } from 'react';
import { useOptionalPrData } from '../../state/PrDataContext';
import { listKnownRepos } from '../../helpers/pr-known-repos.helpers.ts';

/**
 * The repo pickers' suggestions: a datalist of the repos the page knows of
 * (listKnownRepos) - subscribed, PRs added from, or with rows shown. A repo
 * field naming its id (`list`) offers them as it's typed in, and still
 * takes any other repo. Each picker has its own (useId), as sections can
 * be mounted together.
 */
export function KnownReposDatalist({ id }: { id: string }) {
  const payload = useOptionalPrData()?.payload;
  const repos = useMemo(() => listKnownRepos(payload), [payload]);
  return (
    <datalist id={id}>
      {repos.map((repo) => (
        <option key={repo} value={repo} />
      ))}
    </datalist>
  );
}
