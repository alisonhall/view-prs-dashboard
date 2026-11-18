import { useEffect, useId, useState } from 'react';
import { Button } from './ui/Button';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { useLocalBranches } from '../state/LocalBranchesContext';
import { useSnackbar } from '../state/SnackbarContext';
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

// Where git's worktree for a branch goes, as the server works it out
// (view-prs-local-checkout.js' worktreeFolderFor): the repo's folder
// pattern - ../{clone}-{branch} unless set - with {branch} (/ as _, and
// nothing Windows refuses) and {clone} (the clone folder's name).
export const DEFAULT_WORKTREE_FOLDER = '../{clone}-{branch}';
export const previewWorktreeFolder = (pattern: string | undefined, clonePath: string, branch: string) =>
  (pattern || DEFAULT_WORKTREE_FOLDER)
    .replace(/\{branch\}/g, branch.replace(/[/\\]/g, '_').replace(/[<>:"|?*]/g, '_'))
    .replace(/\{clone\}/g, folderName(clonePath));

// Why git wouldn't take a branch name (git check-ref-format's rules, near
// enough - the server asks git itself); "" when it would.
export const branchNameProblem = (name: string) => {
  if (!name) return '';
  if (/\s/.test(name)) return 'No spaces in a branch name';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f~^:?*[\\]/.test(name)) return 'A branch name can\'t have ~ ^ : ? * [ or \\';
  if (/\.\.|@\{|\/\//.test(name)) return 'A branch name can\'t have .., @{ or //';
  if (/^[-/.]|(^|\/)\./.test(name)) return 'A branch name (or a part of one) can\'t start with -, / or .';
  if (/(\/|\.|\.lock)$/.test(name) || name === '@') return 'A branch name can\'t end with /, . or .lock';
  return '';
};

// Editor and Terminal for a folder of the repo's clone (POST
// /view-prs/open-folder), as a row's.
export function OpenFolderButtons({ repo, folder }: { repo: string; folder: string }) {
  const { showError } = useSnackbar();
  const open = async (kind: 'editor' | 'terminal') => {
    const failed = kind === 'editor' ? "Couldn't open the editor" : "Couldn't open a terminal";
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>('/view-prs/open-folder', { repo, path: folder, with: kind });
      if (!response.ok || result.ok === false) showError(failed, result.error || `HTTP ${response.status}`);
    } catch (error) {
      showError(failed, error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <span className="open-folder-buttons">
      <Button title={`Open ${folder} in the editor`} onClick={() => void open('editor')}>
        Open in editor
      </Button>
      <Button title={`Open a terminal in ${folder}`} onClick={() => void open('terminal')}>
        Terminal
      </Button>
    </span>
  );
}

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

  // The clone's branches, to say a name's taken before it's tried (and,
  // with no start given, to choose one from).
  const asked = useBranchStarts(repo, !starts);
  const options = starts || asked.starts;
  const startRef = start?.ref || (options.some((item) => item.ref === chosenStart) ? chosenStart : options[0]?.ref || '');
  const trimmed = name.trim();
  const clonePath = repos[repo]?.path || '';
  const problem = branchNameProblem(trimmed) || (options.some((item) => !item.remote && item.name === trimmed) ? `${repo}'s clone already has a branch ${trimmed}` : '');

  const create = async () => {
    if (!trimmed || !startRef || busy || problem) return;
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
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${nameId}-hint`}
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
      <p id={`${nameId}-hint`} className="new-branch-hint" data-tone={problem ? 'error' : undefined} aria-live="polite">
        {problem ||
          (trimmed
            ? mode === 'switch'
              ? `In ${folderName(clonePath) || 'the clone'}, the clone's own folder`
              : `In ${previewWorktreeFolder(repos[repo]?.checkout?.folder, clonePath, trimmed)}`
            : '')}
      </p>
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
        <Button type="submit" disabled={busy || !trimmed || !startRef || Boolean(problem)}>
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
