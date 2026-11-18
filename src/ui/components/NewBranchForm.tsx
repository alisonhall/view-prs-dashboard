import { useEffect, useId, useState } from 'react';
import { Button } from './ui/Button';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { useLocalBranches } from '../state/LocalBranchesContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../helpers/form-parsing.helpers.ts';

// A branch a new one can start from (GET /view-prs/local-repos/branches'
// starts): refs/heads/<name>, or refs/remotes/<remote>/<name> (remote).
export interface BranchStart {
  ref: string;
  name: string;
  remote?: boolean;
}

// What POST /view-prs/tracked-branches/new answers.
export interface NewBranchResult {
  ok?: boolean;
  error?: string;
  output?: string;
  branch?: string;
  worktreePath?: string;
  startedFrom?: string;
  fetched?: boolean;
  warning?: string;
}

// Every branch a new one could start from, asked of the server for one
// clone while `enabled`.
export function useBranchStarts(repo: string, enabled: boolean) {
  const [state, setState] = useState<{ repo: string; starts: BranchStart[]; error: string }>({ repo: '', starts: [], error: '' });
  useEffect(() => {
    if (!enabled || !repo) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/view-prs/local-repos/branches?repo=${encodeURIComponent(repo)}&starts=1`, { cache: 'no-store' });
        const result = (await response.json()) as { ok?: boolean; starts?: BranchStart[]; error?: string };
        if (cancelled) return;
        if (!response.ok || result.ok === false) setState({ repo, starts: [], error: result.error || `HTTP ${response.status}` });
        else setState({ repo, starts: result.starts || [], error: '' });
      } catch (error) {
        if (!cancelled) setState({ repo, starts: [], error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, enabled]);
  return state.repo === repo ? state : { repo, starts: [], error: '' };
}

const folderName = (folder: string) => folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder;

/**
 * New branch: a local branch started from another - a tracked row's
 * (`start` given), or any branch of the clone, local or remote (`starts`
 * to choose from) - fetched first so it starts from the newest, in a new
 * worktree or the clone's own folder switched to it (the repo's last
 * choice first), then tracked (POST /view-prs/tracked-branches/new).
 */
export function NewBranchForm({
  repo,
  start,
  starts,
  onDone,
  onCancel,
}: {
  repo: string;
  // A tracked row's branch: refs/heads/<branch>.
  start?: BranchStart;
  // Else the branches to start from, chosen here.
  starts?: BranchStart[];
  onDone: (result: NewBranchResult) => void;
  onCancel?: () => void;
}) {
  const { repos, refresh } = useLocalBranches();
  const nameId = useId();
  const startId = useId();
  const [name, setName] = useState('');
  const [chosenStart, setChosenStart] = useState('');
  const [fetchFirst, setFetchFirst] = useState(true);
  const [mode, setMode] = useState<'worktree' | 'switch'>(repos[repo]?.newBranch === 'switch' ? 'switch' : 'worktree');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = starts || [];
  const startRef = start?.ref || (options.some((item) => item.ref === chosenStart) ? chosenStart : options[0]?.ref || '');
  const trimmed = name.trim();

  const create = async () => {
    if (!trimmed || !startRef || busy) return;
    setBusy(true);
    setError('');
    try {
      const { response, result } = await postJson<NewBranchResult>('/view-prs/tracked-branches/new', {
        repo,
        name: trimmed,
        start: startRef,
        fetch: fetchFirst,
        mode,
      });
      if (!response.ok || result.ok === false) {
        const message = result.error || `HTTP ${response.status}`;
        // What git printed, unless the message already says it.
        const output = (result.output || '')
          .split('\n')
          .filter((line) => line.trim() && !message.includes(line.replace(/^(fatal|error):\s*/i, '').trim()))
          .slice(-4)
          .join('\n');
        setError([message, output].filter(Boolean).join('\n'));
        return;
      }
      refresh();
      onDone(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const clonePath = repos[repo]?.path || '';
  return (
    <form
      className="new-branch-form"
      aria-label={start ? `New branch from ${start.name}` : `New branch in ${repo}`}
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="new-branch-fields">
        <label htmlFor={nameId}>New branch</label>
        <input
          id={nameId}
          type="text"
          value={name}
          placeholder="feature/my-idea"
          autoFocus
          {...NON_CREDENTIAL_INPUT_PROPS}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor={startId}>from</label>
        {start ? (
          <output id={startId} className="new-branch-start">
            {start.name}
          </output>
        ) : (
          <select id={startId} value={startRef} onChange={(event) => setChosenStart(event.target.value)}>
            {options.some((item) => !item.remote) && (
              <optgroup label="Local branches">
                {options
                  .filter((item) => !item.remote)
                  .map((item) => (
                    <option key={item.ref} value={item.ref}>
                      {item.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {options.some((item) => item.remote) && (
              <optgroup label="Remote branches">
                {options
                  .filter((item) => item.remote)
                  .map((item) => (
                    <option key={item.ref} value={item.ref}>
                      {item.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        )}
      </div>
      <label className="new-branch-check">
        <input type="checkbox" checked={fetchFirst} onChange={(event) => setFetchFirst(event.target.checked)} />
        Fetch it first, to start from its newest on GitHub
      </label>
      <fieldset className="new-branch-mode">
        <legend>Where</legend>
        <label>
          <input type="radio" name={`${nameId}-mode`} checked={mode === 'worktree'} onChange={() => setMode('worktree')} />
          A new worktree (its own folder, beside the clone)
        </label>
        <label>
          <input type="radio" name={`${nameId}-mode`} checked={mode === 'switch'} onChange={() => setMode('switch')} />
          Switch the clone{clonePath ? ` (${folderName(clonePath)})` : ''} to it - only with no uncommitted changes there
        </label>
      </fieldset>
      {error && (
        <p className="new-branch-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-branch-actions">
        <Button type="submit" disabled={busy || !trimmed || !startRef}>
          {busy ? 'Making it…' : 'Make and track it'}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

// What a made branch's notice says.
export const describeNewBranch = (result: NewBranchResult) =>
  [
    `Made ${result.branch}${result.startedFrom ? ` from ${result.startedFrom}` : ''}${result.worktreePath ? ` in ${folderName(result.worktreePath)}` : ''}, and tracking it.`,
    result.warning || '',
  ]
    .filter(Boolean)
    .join(' ');
