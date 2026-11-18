import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Button } from './ui/Button';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { formatShortAge } from '../helpers/pr-row-signals.helpers.ts';
import { formatCommitAge } from '../helpers/tracked-branches.helpers.ts';
import { useLocalBranches } from '../state/LocalBranchesContext';
import { NewBranchForm, OpenFolderButtons, describeNewBranch, useBranchStarts } from './NewBranchForm';

// A local branch that could be tracked (GET /view-prs/local-repos/branches).
export interface BranchCandidate {
  name: string;
  oid: string;
  committedAt?: string;
  subject?: string;
  worktreePath?: string;
  // The remote branch it tracks (origin/feature).
  upstream?: string;
  // The repo's default branch or an open PR's base: listed first.
  main?: boolean;
}

interface CandidatesResult {
  ok?: boolean;
  branches?: BranchCandidate[];
  defaultBranch?: string;
  error?: string;
}

// The local branches each clone could track, asked of the server: { repo
// => branches }, and the repos it couldn't say for. Asked again with
// `refresh`, or when the repos change.
export function useBranchCandidates(repos: ReadonlyArray<string>, version = '') {
  const [state, setState] = useState<{ byRepo: Record<string, BranchCandidate[]>; errors: Record<string, string>; loading: boolean }>({
    byRepo: {},
    errors: {},
    loading: false,
  });
  const [ask, setAsk] = useState(0);
  const reposKey = repos.join('\n');
  useEffect(() => {
    const wanted = reposKey ? reposKey.split('\n') : [];
    if (wanted.length === 0) {
      setState({ byRepo: {}, errors: {}, loading: false });
      return undefined;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    Promise.all(
      wanted.map(async (repo): Promise<[string, BranchCandidate[] | null, string]> => {
        try {
          const response = await fetch(`/view-prs/local-repos/branches?repo=${encodeURIComponent(repo)}`, { cache: 'no-store' });
          const result = (await response.json()) as CandidatesResult;
          if (!response.ok || result.ok === false) return [repo, null, result.error || `HTTP ${response.status}`];
          return [repo, result.branches || [], ''];
        } catch (error) {
          return [repo, null, error instanceof Error ? error.message : String(error)];
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const byRepo: Record<string, BranchCandidate[]> = {};
      const errors: Record<string, string> = {};
      results.forEach(([repo, branches, error]) => {
        if (branches) byRepo[repo] = branches;
        else errors[repo] = error;
      });
      setState({ byRepo, errors, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [reposKey, version, ask]);
  const refresh = useCallback(() => setAsk((count) => count + 1), []);
  return { ...state, refresh };
}

// A filter box once a clone has more branches than this to pick from.
const FILTER_FROM = 6;

// The repos with a clone this computer can read, A-Z.
export const useReadableCloneRepos = () => {
  const { repos } = useLocalBranches();
  return useMemo(
    () =>
      Object.entries(repos)
        .filter(([, status]) => status.ok)
        .map(([repo]) => repo)
        .sort((a, b) => a.localeCompare(b)),
    [repos],
  );
};

/**
 * Track a branch: the local branches of this computer's clones that have
 * no PR and aren't tracked already - the main branches (the default, PRs'
 * bases) first, then newest first - each with Track (POST /view-prs/tracked-branches). In the
 * Add popover's Branch tab and the Tracked Branches section.
 *
 * `version` asks for the list again when it changes (the tracked list's).
 */
export function TrackBranchPicker({ version = '', onTracked }: { version?: string; onTracked?: (repo: string, branch: string) => void }) {
  const repos = useReadableCloneRepos();
  const { refresh: refreshLocal } = useLocalBranches();
  const repoId = useId();
  const [chosenRepo, setChosenRepo] = useState('');
  const repo = repos.includes(chosenRepo) ? chosenRepo : repos[0] || '';
  const { byRepo, errors, loading, refresh } = useBranchCandidates(repo ? [repo] : [], version);
  const [tracking, setTracking] = useState('');
  // folder: a new branch's, with Editor and Terminal beside the words.
  const [outcome, setOutcome] = useState<{ tone: 'done' | 'error'; text: string; folder?: string } | null>(null);
  const filterId = useId();
  const [filter, setFilter] = useState('');
  // New branch: from any branch of the clone, local or remote.
  const [showNew, setShowNew] = useState(false);
  const { starts, error: startsError } = useBranchStarts(repo, showNew);

  if (repos.length === 0) {
    return (
      <p className="track-branch-empty">
        Save a clone in Settings › Local clones first: the branches to track are picked from your clones' local branches.
      </p>
    );
  }

  const track = async (branch: string) => {
    setTracking(branch);
    setOutcome(null);
    try {
      const { response, result } = await postJson<{ ok?: boolean; added?: boolean; error?: string }>('/view-prs/tracked-branches', { repo, branch });
      if (!response.ok || result.ok === false) {
        setOutcome({ tone: 'error', text: result.error || `Couldn't track ${branch} (HTTP ${response.status})` });
        return;
      }
      setOutcome({ tone: 'done', text: result.added ? `Tracking ${branch}.` : `${branch} was already tracked.` });
      refresh();
      refreshLocal();
      onTracked?.(repo, branch);
    } catch (error) {
      setOutcome({ tone: 'error', text: `Couldn't track ${branch}: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setTracking('');
    }
  };

  const branches = byRepo[repo] || [];
  // Each word of the filter in the branch's name or newest commit's subject.
  // Only while the box is there to clear it (a clone with few branches has none).
  const hasFilter = branches.length > FILTER_FROM;
  const words = hasFilter ? filter.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const listed = words.length === 0 ? branches : branches.filter((branch) => words.every((word) => `${branch.name}\n${branch.subject || ''}`.toLowerCase().includes(word)));
  const now = Date.now();
  return (
    <div className="track-branch-picker">
      {repos.length > 1 && (
        <div className="track-branch-repo">
          <label htmlFor={repoId}>Clone</label>
          <select
            id={repoId}
            value={repo}
            onChange={(event) => {
              setChosenRepo(event.target.value);
              setFilter('');
              setShowNew(false);
            }}
          >
            {repos.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="track-branch-new-toggle">
        <Button icon="branch" pressed={showNew} onClick={() => setShowNew((value) => !value)}>
          New branch…
        </Button>
        <span className="track-branch-new-hint">or track one you have:</span>
      </div>
      {showNew && (
        <div className="track-branch-new">
          {startsError ? (
            <p className="track-branch-empty" role="alert">
              Couldn't read {repo}'s branches: {startsError}
            </p>
          ) : starts.length === 0 ? (
            <p className="track-branch-empty" role="status">
              Reading {repo}'s branches…
            </p>
          ) : (
            <NewBranchForm
              key={repo}
              repo={repo}
              starts={starts}
              onCancel={() => setShowNew(false)}
              onDone={(result) => {
                setShowNew(false);
                setOutcome({ tone: 'done', text: describeNewBranch(result), folder: result.worktreePath });
                refresh();
                if (result.branch) onTracked?.(repo, result.branch);
              }}
            />
          )}
        </div>
      )}
      {errors[repo] ? (
        <p className="track-branch-empty" role="alert">
          Couldn't read the clone of {repo}: {errors[repo]}
        </p>
      ) : loading && branches.length === 0 ? (
        <p className="track-branch-empty" role="status">
          Reading {repo}'s branches…
        </p>
      ) : branches.length === 0 ? (
        <p className="track-branch-empty">
          Nothing left to track in {repo}: its local branches are PRs' or tracked already.
        </p>
      ) : (
        <>
        {hasFilter && (
          <div className="track-branch-filter">
            <label htmlFor={filterId} className="ui-visually-hidden">
              Filter {repo}'s branches
            </label>
            <input
              id={filterId}
              type="search"
              value={filter}
              placeholder={`Filter ${branches.length} branches…`}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
        )}
        {listed.length === 0 ? (
          <p className="track-branch-empty">No branch matches “{filter.trim()}”.</p>
        ) : (
        <ul className="track-branch-list" aria-label={`${repo}'s local branches with no PR`}>
          {listed.map((branch) => (
            <li key={branch.name} className="track-branch-item">
              <span className="track-branch-text">
                <span className="track-branch-name">
                  {branch.name}
                  {branch.main && (
                    <span className="track-branch-main" title="The repo's default branch, or the base of an open PR">
                      main branch
                    </span>
                  )}
                </span>
                <span className="track-branch-meta">
                  {[
                    branch.worktreePath ? `in ${branch.worktreePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()}` : 'not checked out',
                    branch.upstream ? `tracks ${branch.upstream}` : 'local only',
                    formatCommitAge(formatShortAge(branch.committedAt, now)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {branch.subject && <span className="track-branch-subject">{branch.subject}</span>}
              </span>
              <Button disabled={Boolean(tracking)} onClick={() => void track(branch.name)} aria-label={`Track ${branch.name}`}>
                {tracking === branch.name ? 'Tracking…' : 'Track'}
              </Button>
            </li>
          ))}
        </ul>
        )}
        </>
      )}
      {outcome && (
        <p className="add-pr-outcome" data-tone={outcome.tone} role={outcome.tone === 'error' ? 'alert' : 'status'}>
          <span>{outcome.text}</span>
          {outcome.folder && <OpenFolderButtons repo={repo} folder={outcome.folder} />}
        </p>
      )}
    </div>
  );
}
