import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import { useOptionalPrData } from '../../state/PrDataContext';
import { useLocalBranches, type LocalRepoStatus, type LocalRepoCheckout } from '../../state/LocalBranchesContext';
import { sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { listKnownRepos } from '../../helpers/pr-known-repos.helpers.ts';
import { Button } from '../ui/Button';
import { CheckoutSettings } from './CheckoutSettings';

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

interface FindResult {
  ok?: boolean;
  error?: string;
  found?: Array<{ repo: string; path: string }>;
  truncated?: boolean;
}

// Same folder, as git and Windows write it (slashes, case).
const sameFolder = (a: string, b: string) => a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * Find: the clones of the page's repos in a folder (up to three levels down
 * - a folder named main rather than the worktrees beside it), each with Use, and
 * Use all for the first found of each repo without a clone saved, or whose
 * saved one can't be read.
 */
function FindClones({
  repos,
  statuses,
  onUse,
}: {
  repos: string[];
  statuses: Record<string, LocalRepoStatus>;
  onUse: (repo: string, path: string) => Promise<boolean>;
}) {
  const fieldId = useId();
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);

  const find = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { response, result: answer } = await postJson<FindResult>('/view-prs/local-repos/find', { folder: folder.trim(), repos });
      setResult(!response.ok && !answer.error ? { ok: false, error: `HTTP ${response.status}` } : answer);
    } catch (caught) {
      setResult({ ok: false, error: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  };

  const found = result?.ok ? result.found || [] : [];
  const isSaved = (item: { repo: string; path: string }) => {
    const savedPath = statuses[item.repo]?.path;
    return Boolean(savedPath && sameFolder(savedPath, item.path));
  };
  // The first found of each repo with no clone saved yet - or one saved
  // that can't be read (moved or deleted since).
  const toUse = found.filter(
    (item, index) => !statuses[item.repo]?.ok && !isSaved(item) && found.findIndex((other) => other.repo === item.repo) === index,
  );

  const saveAll = async () => {
    setBusy(true);
    try {
      for (const item of toUse) {
        // One at a time: each save rewrites the file.
        await onUse(item.repo, item.path);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-group local-clones-find">
      <form className="sources-add" onSubmit={find}>
        <label htmlFor={fieldId}>Find clones in a folder</label>
        <div className="sources-add-row">
          <input
            id={fieldId}
            className="local-clone-path"
            type="text"
            placeholder="Folder your repos are in, like D:/Sites"
            {...NON_CREDENTIAL_INPUT_PROPS}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
          />
          <Button type="submit" disabled={busy || !folder.trim() || repos.length === 0}>
            {busy ? 'Looking…' : 'Find'}
          </Button>
        </div>
      </form>
      {result && !result.ok && (
        <p className="settings-error" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && found.length === 0 && (
        <p className="settings-hint" role="status">
          No clones of these repos there, or up to three folders down.
        </p>
      )}
      {found.length > 0 && (
        <>
          <ul className="sources-list" aria-label="Clones found">
            {found.map((item) => (
              <li key={`${item.repo}\n${item.path}`} className="sources-item">
                <span className="sources-item-name">{item.repo}</span>
                <code className="sources-item-meta">{item.path}</code>
                {isSaved(item) ? (
                  <span className="sources-item-meta">Saved</span>
                ) : (
                  <Button disabled={busy} aria-label={`Use ${item.path} for ${item.repo}`} onClick={() => void onUse(item.repo, item.path)}>
                    Use
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {toUse.length > 1 && (
            <Button disabled={busy} onClick={() => void saveAll()}>
              Use all ({toUse.length})
            </Button>
          )}
          {result?.truncated && <p className="settings-hint">Stopped after looking in 2000 folders: choose a folder closer to your repos.</p>}
        </>
      )}
    </div>
  );
}

/**
 * Settings › Local clones: where each repo's clone is on this computer, so
 * the rows and the pane can show what it has of each PR's branch - the
 * local branch, the worktree it's checked out in, and how far it is ahead
 * of or behind the PR - and open the worktree in the code editor. Kept by
 * the server in its own file (local-repos.json), not with the settings that
 * travel between computers. A folder is saved once git finds it's a clone
 * of the repo. Find offers the clones in a folder, to save in a click.
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

  // The other repos' checkout settings, for Copy from.
  const checkoutsBesides = (repo: string) =>
    Object.fromEntries(
      Object.entries(statuses).flatMap(([other, status]) => (other !== repo && status?.checkout ? [[other, status.checkout]] : [])),
    ) as Record<string, LocalRepoCheckout>;

  // Whether it was saved (or removed).
  const change = async (repo: string, method: 'PUT' | 'DELETE', body: Record<string, string>): Promise<boolean> => {
    setBusyRepo(repo);
    setErrors(({ [repo]: _dropped, ...rest }) => rest);
    try {
      const { response, result } = await sendJson<LocalReposResult>(method, '/view-prs/local-repos', body);
      if (!response.ok || result.ok === false) {
        setErrors((previous) => ({ ...previous, [repo]: result.error || `HTTP ${response.status}` }));
        return false;
      }
      if (result.repos) setRepos(result.repos);
      setDrafts(({ [repo]: _dropped, ...rest }) => rest);
      refresh();
      return true;
    } catch (caught) {
      setErrors((previous) => ({ ...previous, [repo]: caught instanceof Error ? caught.message : String(caught) }));
      return false;
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
      <FindClones repos={knownRepos} statuses={statuses} onUse={(repo, path) => change(repo, 'PUT', { repo, path })} />
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
                {status?.ok && <CheckoutSettings repo={repo} status={status} others={checkoutsBesides(repo)} onSaved={setRepos} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
