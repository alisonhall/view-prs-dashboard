import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PrTrackedBranch } from '../../types/pr-data.ts';
import { CopyIconButton } from '../CopyIconButton';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import { NewBranchForm, OpenFolderButtons, describeNewBranch } from '../NewBranchForm';
import { useTrackedBranchChanges } from '../TrackedBranchesSection';
import { useTrackedBranchActions } from '../../state/useTrackedBranchActions';
import { useLocalBranches } from '../../state/LocalBranchesContext';
import { useFocusTrap } from '../../state/useFocusTrap';
import { formatShortAge } from '../../helpers/pr-row-signals.helpers.ts';
import { describeBranchChips, describeBranchWhere, formatCommitAge, trackedBranchKey } from '../../helpers/tracked-branches.helpers.ts';

// One of a tracked branch's commits (GET /view-prs/tracked-branches/commits).
export interface BranchCommit {
  oid: string;
  parents: string[];
  author: string;
  authorEmail?: string;
  committedAt: string;
  subject: string;
  // On one of the repo's remote branches (as the clone last fetched).
  pushed: boolean;
}

export interface BranchCommits {
  ok?: boolean;
  error?: string;
  branch?: string;
  base?: string;
  // The branch is its own base, or the clone hasn't got the base: its
  // newest commits rather than those since it left the base.
  recent?: boolean;
  baseMissing?: boolean;
  mergeBase?: string;
  // How many commits the base has that the branch hasn't.
  behind?: number;
  commits?: BranchCommit[];
  // There are older ones than those listed.
  more?: boolean;
}

// A tracked branch's commits, asked for again when version (what the
// clone says of it) changes.
export function useBranchCommits(repo: string, branch: string, version: string) {
  const [state, setState] = useState<{ key: string; result: BranchCommits | null; loading: boolean }>({ key: '', result: null, loading: false });
  const [attempt, setAttempt] = useState(0);
  const key = `${repo}:${branch}`;
  useEffect(() => {
    if (!repo || !branch) return undefined;
    let cancelled = false;
    setState((current) => ({ key, result: current.key === key ? current.result : null, loading: true }));
    void (async () => {
      let result: BranchCommits;
      try {
        const response = await fetch(`/view-prs/tracked-branches/commits?${new URLSearchParams({ repo, branch })}`, { cache: 'no-store' });
        result = (await response.json().catch(() => ({}))) as BranchCommits;
        if (!response.ok || result.ok === false) result = { ok: false, error: result.error || `HTTP ${response.status}` };
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (!cancelled) setState({ key, result, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, branch, key, version, attempt]);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { result: state.key === key ? state.result : null, loading: state.loading, retry };
}

// The files a commit changed (GET /view-prs/tracked-branches/commit-files).
export interface CommitFile {
  path: string;
  oldPath?: string;
  added: number;
  removed: number;
  binary?: boolean;
}
interface CommitFiles {
  ok?: boolean;
  error?: string;
  files?: CommitFile[];
  more?: boolean;
}

// What git status's two-letter code means, in words.
export const describeStatusCode = (code: string) => {
  if (code === '??') return 'new';
  if (/^(DD|AU|UD|UA|DU|AA|UU)$/.test(code)) return 'conflict';
  const staged = code[0] !== ' ' && code[0] !== '?';
  const changed = code[1] !== ' ';
  if (staged && changed) return 'staged, changed again';
  return staged ? 'staged' : 'changed';
};

// One commit in the list: opens to the files it changed, asked for the
// first time it's opened.
function CommitItem({ repo, commit, now }: { repo: string; commit: BranchCommit; now: number }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<CommitFiles | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/view-prs/tracked-branches/commit-files?${new URLSearchParams({ repo, oid: commit.oid })}`, { cache: 'no-store' });
      const result = (await response.json().catch(() => ({}))) as CommitFiles;
      setFiles(!response.ok || result.ok === false ? { ok: false, error: result.error || `HTTP ${response.status}` } : result);
    } catch (error) {
      setFiles({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };
  const toggle = () => {
    if (!open && (!files || files.ok === false)) void load();
    setOpen(!open);
  };
  const age = formatCommitAge(formatShortAge(commit.committedAt, now));
  const short = commit.oid.slice(0, 7);
  const list = files?.files || [];
  return (
    <li className="branch-pane-commit">
      <span className="branch-pane-commit-subject">
        <button type="button" className="branch-pane-commit-toggle" aria-expanded={open} title={open ? 'Hide its files' : 'Show the files it changed'} onClick={toggle}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
          <span>{commit.subject || '(no message)'}</span>
        </button>
        {commit.parents.length > 1 && <span className="branch-pane-commit-tag">merge</span>}
        {!commit.pushed && (
          <span className="tracked-branch-chip" data-tone="attention">
            not pushed
          </span>
        )}
      </span>
      <span className="branch-pane-commit-meta">
        {commit.pushed ? (
          <a href={`https://github.com/${repo}/commit/${commit.oid}`} target="_blank" rel="noopener noreferrer" title="Open on GitHub">
            <code>{short}</code>
          </a>
        ) : (
          <code>{short}</code>
        )}
        <CopyIconButton text={commit.oid} label={`Copy commit ${short}`} />
        <span>{commit.author}</span>
        <Tooltip content={commit.committedAt ? new Date(commit.committedAt).toLocaleString() : ''}>
          <span tabIndex={0}>{age}</span>
        </Tooltip>
      </span>
      {open && (
        <div className="branch-pane-files">
          {loading && !files ? (
            <p className="pr-pane-none">Loading…</p>
          ) : files?.ok === false ? (
            <p className="pr-pane-detail-error branch-pane-error" role="alert">
              Couldn't list its files: {files.error}.{' '}
              <button type="button" className="ui-link-button" onClick={() => void load()}>
                Try again
              </button>
            </p>
          ) : list.length === 0 ? (
            <p className="pr-pane-none">No files changed{commit.parents.length > 1 ? ' against its first parent' : ''}.</p>
          ) : (
            <ul className="branch-pane-file-list" aria-label={`Files changed in ${short}`}>
              {list.map((file) => (
                <li key={`${file.oldPath || ''}>${file.path}`} className="branch-pane-file">
                  <code className="branch-pane-file-path">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</code>
                  {file.binary ? (
                    <span className="branch-pane-file-stat">binary</span>
                  ) : (
                    <span className="branch-pane-file-stat">
                      <span className="branch-pane-added">+{file.added}</span> <span className="branch-pane-removed">−{file.removed}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {files?.more && <p className="pr-pane-none branch-pane-more">More files than are listed.</p>}
        </div>
      )}
    </li>
  );
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

export interface BranchDetailPaneProps {
  entry: PrTrackedBranch;
  mode: 'docked' | 'drawer';
  onPrevious?: () => void;
  onNext?: () => void;
  // Close: hides the pane (and clears the selection).
  onClose: () => void;
  // Esc in the docked pane: clears the selection, keeping the pane.
  onClearSelection?: () => void;
}

/**
 * The detail pane for a tracked branch (one with no PR): the PR pane's
 * frame - docked beside the table, or a drawer below 900px - with the
 * branch's name, where it's checked out, how it stands against its base
 * and upstream, its note, Open in editor and Terminal, and its commits
 * since it left its base (a main branch: its newest), each marked when
 * it isn't on GitHub.
 */
export function BranchDetailPane({ entry, mode, onPrevious, onNext, onClose, onClearSelection = onClose }: BranchDetailPaneProps) {
  const containerRef = useRef<HTMLElement>(null);
  const isDrawer = mode === 'drawer';
  useFocusTrap(containerRef, isDrawer, onClose);
  const { repos, branches: statuses } = useLocalBranches();
  const key = trackedBranchKey(entry.repo, entry.branch);
  const status = statuses[key];
  const hasClone = Boolean(repos[entry.repo]);
  const where = describeBranchWhere(status, hasClone);
  const folder = status?.worktreePath || '';
  // Its uncommitted changes while it's checked out (as the row's).
  const changes = useTrackedBranchChanges(folder ? key : '')[key];
  const chips = describeBranchChips(status, changes);
  const { pull, fetchBranch, pullingKey, fetchingKey, notice, setNotice } = useTrackedBranchActions();
  const [showNew, setShowNew] = useState(false);
  const upstream = status?.found && status.upstream && !status.upstream.gone ? status.upstream : null;
  const uncommitted = changes?.files || [];
  const note = String(entry.note || '').trim();
  // Asked again when the branch, its base or what's pushed moves.
  const version = [status?.oid, status?.base, status?.baseBehind, status?.unpushed].join(':');
  const { result, loading, retry } = useBranchCommits(hasClone && status?.found ? entry.repo : '', entry.branch, version);
  const now = Date.now();

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isDrawer || event.key !== 'Escape' || isEditable(event.target)) return;
    event.preventDefault();
    onClearSelection();
  };

  const commits = result?.commits || [];
  const base = result?.base || status?.base || '';
  const heading = result?.recent
    ? result.baseMissing
      ? `Newest commits (the clone hasn't got ${base})`
      : 'Newest commits'
    : base
      ? `Commits since it left ${base}`
      : 'Commits';

  const pane = (
    <aside
      ref={containerRef}
      className="pr-pane branch-pane"
      data-mode={mode}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer ? true : undefined}
      aria-label={`Branch ${entry.branch}`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="pr-pane-header">
        <div className="pr-pane-nav">
          <IconButton icon="chevronUp" label="Previous branch" disabled={!onPrevious} onClick={() => onPrevious?.()} />
          <IconButton icon="chevronDown" label="Next branch" disabled={!onNext} onClick={() => onNext?.()} />
          <IconButton icon="close" label="Close details" className="pr-pane-close" onClick={onClose} />
        </div>
        <h2 className="pr-pane-title">
          <span className="pr-pane-branch-name">
            <Icon name="branch" size={16} />
            <code className="branch-pane-name">{entry.branch}</code>
            <CopyIconButton text={entry.branch} label="Copy branch name" />
          </span>
        </h2>
        <p className="pr-pane-meta">
          <span>{entry.repo}</span>
          {base && base !== entry.branch && (
            <span className="pr-pane-branch">
              based on <code>{base}</code>
            </span>
          )}
          <Tooltip content={where.hint}>
            <span tabIndex={0}>{where.text}</span>
          </Tooltip>
        </p>
        {chips.length > 0 && (
          <p className="pr-pane-local branch-pane-chips">
            {chips.map((chip) => (
              <Tooltip key={chip.key} content={chip.hint}>
                <span className="tracked-branch-chip" data-tone={chip.tone} tabIndex={0}>
                  {chip.text}
                </span>
              </Tooltip>
            ))}
          </p>
        )}
        {note && <p className="branch-pane-note">{note}</p>}
      </header>

      {status?.found && (
        <div className="pr-pane-actions" role="group" aria-label="Actions">
          {upstream && (
            <Button
              icon="refresh"
              hint={`Fetch ${upstream.remote}/${upstream.branch}, so how far behind it is is current - ${entry.branch} itself isn't changed`}
              disabled={fetchingKey === key}
              onClick={() => void fetchBranch(entry)}
            >
              Fetch
            </Button>
          )}
          {upstream && (
            <Button
              icon="arrowDown"
              hint={`Fetch ${upstream.remote}/${upstream.branch} and fast-forward ${entry.branch} to it (asks first)`}
              disabled={pullingKey === key}
              onClick={() => void pull(entry)}
            >
              Pull
            </Button>
          )}
          {hasClone && (
            <Button icon="branch" pressed={showNew} hint="Make a new branch from it, in a new worktree or the clone's folder, and track it" onClick={() => setShowNew(!showNew)}>
              New branch
            </Button>
          )}
          {folder && <OpenFolderButtons repo={entry.repo} folder={folder} />}
        </div>
      )}
      {notice && (
        <p className="tracked-branches-notice branch-pane-notice" role="status">
          <span>{notice.text}</span>
          {notice.repo && notice.folder && <OpenFolderButtons repo={notice.repo} folder={notice.folder} />}
        </p>
      )}
      {showNew && status?.found && (
        <div className="branch-pane-new">
          <NewBranchForm
            repo={entry.repo}
            start={{ ref: `refs/heads/${entry.branch}`, name: entry.branch }}
            onCancel={() => setShowNew(false)}
            onDone={(made) => {
              setShowNew(false);
              setNotice({ text: describeNewBranch(made), repo: entry.repo, folder: made.worktreePath });
            }}
          />
        </div>
      )}

      {uncommitted.length > 0 && (
        <section className="pr-pane-panel branch-pane-uncommitted" aria-labelledby={`branch-pane-uncommitted-${key}`}>
          <h3 id={`branch-pane-uncommitted-${key}`} className="branch-pane-heading">
            Uncommitted changes
            <span className="branch-pane-count">{changes?.total ?? uncommitted.length}</span>
          </h3>
          <ul className="branch-pane-file-list">
            {uncommitted.map((file) => (
              <li key={`${file.code}:${file.path}`} className="branch-pane-file">
                <code className="branch-pane-file-path">{file.path}</code>
                <span className="branch-pane-file-stat" data-tone={describeStatusCode(file.code) === 'conflict' ? 'danger' : undefined}>
                  {describeStatusCode(file.code)}
                </span>
              </li>
            ))}
          </ul>
          {(changes?.total || 0) > uncommitted.length && (
            <p className="pr-pane-none branch-pane-more">And {(changes?.total || 0) - uncommitted.length} more.</p>
          )}
        </section>
      )}

      <section className="pr-pane-panel branch-pane-commits" aria-labelledby={`branch-pane-commits-${key}`}>
        <h3 id={`branch-pane-commits-${key}`} className="branch-pane-heading">
          {heading}
          {commits.length > 0 && <span className="branch-pane-count">{result?.more ? `${commits.length}+` : commits.length}</span>}
        </h3>
        {!hasClone || !status ? (
          <p className="pr-pane-none">No clone of {entry.repo} here (Settings › Local clones).</p>
        ) : !status.found ? (
          <p className="pr-pane-none">{entry.repo}'s clone has no branch {entry.branch}.</p>
        ) : result?.ok === false ? (
          <p className="pr-pane-detail-error branch-pane-error" role="alert">
            Couldn't list its commits: {result.error}.{' '}
            <button type="button" className="ui-link-button" onClick={retry}>
              Try again
            </button>
          </p>
        ) : !result ? (
          <p className="pr-pane-none">{loading ? 'Loading…' : ''}</p>
        ) : commits.length === 0 ? (
          <p className="pr-pane-none">No commits of its own yet: it's where {base} was when it was made.</p>
        ) : (
          <ol className="branch-pane-commit-list">
            {commits.map((commit) => (
              <CommitItem key={commit.oid} repo={entry.repo} commit={commit} now={now} />
            ))}
          </ol>
        )}
        {result?.more && <p className="pr-pane-none branch-pane-more">Older commits aren't listed.</p>}
        {!result?.recent && typeof result?.behind === 'number' && result.behind > 0 && (
          <p className="pr-pane-none branch-pane-more">
            {base} has {result.behind} commit{result.behind === 1 ? '' : 's'} since, not on {entry.branch}.
          </p>
        )}
      </section>
    </aside>
  );

  if (!isDrawer) return pane;
  return (
    <div className="pr-pane-overlay">
      <div className="pr-pane-backdrop" aria-hidden="true" onClick={onClose} />
      {pane}
    </div>
  );
}
