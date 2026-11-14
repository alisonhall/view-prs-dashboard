import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import { useOptionalPrData } from '../../state/PrDataContext';
import { useLocalBranches, type LocalRepoStatus, type LocalRepoCheckout } from '../../state/LocalBranchesContext';
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

// "NAME=value" lines - as written in a shell (export, quotes) too - and
// the lines that aren't one.
const parseVariables = (text: string) => {
  const env: Record<string, string> = {};
  const invalid: string[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      invalid.push(trimmed);
      return;
    }
    env[match[1] || ''] = (match[2] || '').trim().replace(/^(["'])(.*)\1$/, '$2');
  });
  return { env, invalid };
};

const variablesToText = (env: Record<string, string> | undefined) =>
  Object.entries(env || {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');

/**
 * How the pane's Check out makes a worktree for a repo's PRs: plain git, or
 * the user's own command - nothing assumed about what it is, only what it
 * has to leave behind - with a command to run after git makes one, where
 * git puts them, and variables for the commands. Each repo its own; Copy
 * from fills them in from another repo's.
 */
function CheckoutSettings({
  repo,
  status,
  others,
  onSaved,
}: {
  repo: string;
  status: LocalRepoStatus;
  // The other repos' checkout settings, to copy from.
  others: Record<string, LocalRepoCheckout>;
  onSaved: (repos: Record<string, LocalRepoStatus>) => void;
}) {
  const id = useId();
  const saved = status.checkout;
  const [command, setCommand] = useState(saved?.command || '');
  const [forks, setForks] = useState(saved?.forks === true);
  const [after, setAfter] = useState(saved?.after || '');
  const [folder, setFolder] = useState(saved?.folder || '');
  const [variables, setVariables] = useState(variablesToText(saved?.env));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fillFrom = (checkout: LocalRepoCheckout | undefined) => {
    setCommand(checkout?.command || '');
    setForks(checkout?.forks === true);
    setAfter(checkout?.after || '');
    setFolder(checkout?.folder || '');
    setVariables(variablesToText(checkout?.env));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const { env, invalid } = parseVariables(variables);
    if (invalid.length > 0) {
      setError(`Not NAME=value: ${invalid.join(', ')}`);
      return;
    }
    const checkout = { command: command.trim(), forks: Boolean(command.trim()) && forks, after: after.trim(), folder: folder.trim(), env };
    setBusy(true);
    try {
      const { response, result } = await sendJson<LocalReposResult>('PUT', '/view-prs/local-repos/checkout', { repo, checkout });
      if (!response.ok || result.ok === false) {
        setError(result.error || `HTTP ${response.status}`);
        return;
      }
      if (result.repos) onSaved(result.repos);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const otherRepos = Object.keys(others).sort();
  return (
    <details className="local-clone-checkout">
      <summary>Check out PRs with {saved?.command ? <code>{saved.command}</code> : 'git'}</summary>
      <form className="settings-group" onSubmit={save}>
        {otherRepos.length > 0 && (
          <>
            <label htmlFor={`${id}-copy`}>Copy from</label>
            <select
              id={`${id}-copy`}
              value=""
              onChange={(event) => {
                if (event.target.value) fillFrom(others[event.target.value]);
              }}
            >
              <option value="">Another repo's settings…</option>
              {otherRepos.map((other) => (
                <option key={other} value={other}>
                  {other}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${id}-command`}>Checkout command</label>
        <input
          id={`${id}-command`}
          type="text"
          placeholder="Empty for git, or your own, like my-checkout {branch}"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
        />
        <p className="settings-hint">
          Run in an interactive shell in the clone&apos;s folder, so your rc file&apos;s aliases and functions work. It has to leave a
          worktree of the clone with a branch tracking the PR&apos;s branch on the repo&apos;s remote (<code>{'{ref}'}</code> on{' '}
          <code>{'{remote}'}</code>).
        </p>
        <label className="settings-check">
          <input type="checkbox" checked={forks} disabled={!command.trim()} onChange={(event) => setForks(event.target.checked)} />
          Use it for forks&apos; PRs too (their pull ref, <code>refs/pull/&lt;number&gt;/head</code>) - else git makes those
        </label>
        <label htmlFor={`${id}-after`}>After git makes a worktree, run</label>
        <input
          id={`${id}-after`}
          type="text"
          placeholder="Optional, like npm ci"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={after}
          onChange={(event) => setAfter(event.target.value)}
        />
        <p className="settings-hint">In the new worktree. If it fails, the worktree stays and you&apos;re told why.</p>
        <label htmlFor={`${id}-folder`}>Folder for git&apos;s worktrees</label>
        <input
          id={`${id}-folder`}
          type="text"
          placeholder={DEFAULT_WORKTREE_FOLDER}
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
        />
        <p className="settings-hint">
          Relative to the clone&apos;s folder, or a full path (<code>~</code> is your home folder), but not inside the clone.{' '}
          <code>{'{branch}'}</code> is the branch&apos;s name with / as _, <code>{'{clone}'}</code> the clone folder&apos;s name.
        </p>
        <label htmlFor={`${id}-variables`}>Variables</label>
        <textarea
          id={`${id}-variables`}
          rows={3}
          placeholder={'Optional, one NAME=value a line'}
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={variables}
          onChange={(event) => setVariables(event.target.value)}
        />
        <p className="settings-hint">
          Given to both commands. In a command, {PLACEHOLDER_NAMES} are the PR&apos;s, quoted for you, so leave them out of quotes of your own (<code>{'{local}'}</code> and{' '}
          <code>{'{worktree}'}</code> in the after-command); scripts get them as VIEW_PRS_ variables, with VIEW_PRS_IS_FORK and
          VIEW_PRS_HEAD_OID.
        </p>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={busy} aria-label={`Save how to check out ${repo}'s PRs`}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </details>
  );
}

const DEFAULT_WORKTREE_FOLDER = '../{clone}-{branch}';
const PLACEHOLDER_NAMES = (
  <>
    <code>{'{branch}'}</code>, <code>{'{number}'}</code>, <code>{'{repo}'}</code>, <code>{'{remote}'}</code>, <code>{'{ref}'}</code> and{' '}
    <code>{'{clone}'}</code>
  </>
);

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
