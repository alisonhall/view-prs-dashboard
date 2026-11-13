import { useEffect, useId, useMemo, useState } from 'react';
import { useOptionalPrData } from '../../state/PrDataContext';
import { useLocalBranches, type LocalRepoStatus } from '../../state/LocalBranchesContext';
import { sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { listKnownRepos } from '../../helpers/pr-known-repos.helpers.ts';
import { Button } from '../ui/Button';

interface LocalReposResult {
  ok?: boolean;
  error?: string;
  repos?: Record<string, LocalRepoStatus>;
}

// "3 branches, 2 worktrees".
const describeClone = (status: LocalRepoStatus) => {
  const branches = status.branchCount || 0;
  const worktrees = status.worktreeCount || 0;
  return `${branches} branch${branches === 1 ? '' : 'es'}, ${worktrees} worktree${worktrees === 1 ? '' : 's'}`;
};

/**
 * Settings › Local clones: where each repo's clone is on this computer, so
 * the rows and the pane can show what it has of each PR's branch - the
 * local branch, the worktree it's checked out in, and how far it is ahead
 * of or behind the PR - and open the worktree in the code editor. Kept by
 * the server in its own file (local-repos.json), not with the settings that
 * travel between computers. A folder is saved once git finds it's a clone
 * of the repo.
 */
export function LocalClonesSection() {
  const payload = useOptionalPrData()?.payload;
  const knownRepos = useMemo(() => listKnownRepos(payload), [payload]);
  const { repos: statuses, setRepos, refresh } = useLocalBranches();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyRepo, setBusyRepo] = useState('');
  const idPrefix = useId();

  // The clones' state afresh when the section opens.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/view-prs/local-repos', { cache: 'no-store' });
        const result = (await response.json()) as LocalReposResult;
        if (!cancelled && result.repos) setRepos(result.repos);
      } catch (_error) {
        // The last check's stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRepos]);

  // Every repo the page knows of, and any with a clone saved.
  const repos = useMemo(() => Array.from(new Set([...knownRepos, ...Object.keys(statuses)])).sort(), [knownRepos, statuses]);

  const change = async (repo: string, method: 'PUT' | 'DELETE', body: Record<string, string>) => {
    setBusyRepo(repo);
    setErrors(({ [repo]: _dropped, ...rest }) => rest);
    try {
      const { response, result } = await sendJson<LocalReposResult>(method, '/view-prs/local-repos', body);
      if (!response.ok || result.ok === false) {
        setErrors((previous) => ({ ...previous, [repo]: result.error || `HTTP ${response.status}` }));
        return;
      }
      if (result.repos) setRepos(result.repos);
      setDrafts(({ [repo]: _dropped, ...rest }) => rest);
      refresh();
    } catch (caught) {
      setErrors((previous) => ({ ...previous, [repo]: caught instanceof Error ? caught.message : String(caught) }));
    } finally {
      setBusyRepo('');
    }
  };

  return (
    <div className="settings-section local-clones-section">
      <p className="settings-hint">
        Where a repo is cloned on this computer. With it, each PR whose branch you have locally shows it: whether it&apos;s
        ahead of or behind the PR on GitHub (as last fetched by the dashboard - nothing is fetched into the clone), the
        worktree it&apos;s checked out in, and Open in editor in the PR&apos;s details. Saved on this computer only.
      </p>
      {repos.length === 0 ? (
        <p className="settings-hint">No repos yet: subscribe to one in Sources.</p>
      ) : (
        <ul className="sources-list">
          {repos.map((repo, index) => {
            const status = statuses[repo];
            const draft = drafts[repo] ?? status?.path ?? '';
            const changed = draft.trim() !== (status?.path || '');
            const busy = busyRepo === repo;
            const inputId = `${idPrefix}-clone-${index}`;
            return (
              <li key={repo} className="sources-item local-clone-item">
                <label className="sources-item-name" htmlFor={inputId}>
                  {repo}
                </label>
                <input
                  id={inputId}
                  className="local-clone-path"
                  type="text"
                  placeholder="Full path of its clone"
                  {...NON_CREDENTIAL_INPUT_PROPS}
                  value={draft}
                  onChange={(event) => setDrafts((previous) => ({ ...previous, [repo]: event.target.value }))}
                />
                <Button
                  disabled={busy || !changed || !draft.trim()}
                  aria-label={`Save the clone's folder for ${repo}`}
                  onClick={() => void change(repo, 'PUT', { repo, path: draft.trim() })}
                >
                  {busy ? 'Checking…' : 'Save'}
                </Button>
                {status && (
                  <Button disabled={busy} aria-label={`Remove the clone's folder for ${repo}`} onClick={() => void change(repo, 'DELETE', { repo })}>
                    Remove
                  </Button>
                )}
                {status && !errors[repo] && (
                  <span className="sources-item-meta" data-tone={status.ok ? undefined : 'error'} role={status.ok ? undefined : 'alert'}>
                    {status.ok ? describeClone(status) : status.error}
                  </span>
                )}
                {errors[repo] && (
                  <span className="sources-item-meta" data-tone="error" role="alert">
                    {errors[repo]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
