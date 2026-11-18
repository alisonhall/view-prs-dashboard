/**
 * TrackedBranchesSection - the Tracked Branches section: branches with no
 * PR, picked from this computer's clones (Track a branch), first among the
 * smart groups and hideable like them (Settings › Appearance). A <details>
 * like PrSection, with a compact row per branch: where it's checked out,
 * its state (uncommitted changes, what isn't pushed, behind its upstream,
 * ahead/behind its base), its newest commit, and Open in editor, Terminal
 * and Untrack.
 *
 * The list is the sources file's trackedBranches (the data's
 * dataMeta.sources); their state is this computer's clone's
 * (LocalBranchesContext's branches), and the uncommitted changes are asked
 * for apart (GET /view-prs/tracked-branches/changes) - on load, every
 * minute while the page is shown, and when the branches change. The page's
 * search and repo filter apply; the other filters are about PRs.
 *
 * While closed, the header says how many local branches with no PR could
 * still be tracked (asked again when the page is focused); it opens the
 * section with the picker shown.
 *
 * @module components/TrackedBranchesSection
 */

import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { PrTrackedBranch } from '../types/pr-data.ts';
import { Icon, type IconName } from './ui/Icon';
import { Button, IconButton } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TrackBranchPicker, useBranchCandidates, useReadableCloneRepos } from './TrackBranchPicker';
import { NewBranchForm, OpenFolderButtons, describeNewBranch } from './NewBranchForm';
import { useLocalBranches } from '../state/LocalBranchesContext';
import { useTrackedBranchActions } from '../state/useTrackedBranchActions';
import { useSnackbar } from '../state/SnackbarContext';
import { useSearchTerms } from '../state/SearchTermsContext';
import { RowFilterSelectionContext } from '../state/RowFilterSelectionContext';
import { sendJson, postJson } from '../helpers/pr-http.helpers.ts';
import { formatShortAge } from '../helpers/pr-row-signals.helpers.ts';
import { BUILT_IN_SECTION_LOOKS } from '../helpers/pr-section-preferences.helpers.ts';
import {
  describeBranchChips,
  describeBranchWhere,
  formatCommitAge,
  sortTrackedBranches,
  trackedBranchKey,
  trackedBranchMatches,
  type TrackedBranchChanges,
} from '../helpers/tracked-branches.helpers.ts';

export const TRACKED_BRANCHES_SECTION_KEY = 'tracked-branches';

const CHANGES_POLL_MS = 60 * 1000;
// How long Undo is offered after Untrack.
const UNDO_MS = 15 * 1000;
const NO_BRANCHES: PrTrackedBranch[] = [];
// As the server takes it (view-prs-sources-storage.js).
const MAX_NOTE_LENGTH = 4000;

// The uncommitted changes of each tracked branch checked out here, asked
// for while any is: { key => changes }.
export function useTrackedBranchChanges(checkedOutKey: string, pollMs = CHANGES_POLL_MS) {
  const [changes, setChanges] = useState<Record<string, TrackedBranchChanges>>({});
  const lastText = useRef('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/view-prs/tracked-branches/changes', { cache: 'no-store' });
      if (!response.ok) return;
      const result = (await response.json()) as { changes?: Record<string, TrackedBranchChanges> };
      const text = JSON.stringify(result.changes || {});
      if (text === lastText.current) return;
      lastText.current = text;
      setChanges(result.changes || {});
    } catch (_error) {
      // Next time.
    }
  }, []);
  useEffect(() => {
    if (!checkedOutKey) {
      if (lastText.current !== '{}') {
        lastText.current = '{}';
        setChanges({});
      }
      return undefined;
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, pollMs);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkedOutKey, load, pollMs]);
  return changes;
}

type OpenKind = 'editor' | 'terminal';

// A click on a row itself, to open it in the pane: not on one of its
// buttons, links or fields, and not the end of selecting its text.
const isRowClick = (event: MouseEvent) => {
  const target = event.target as Element | null;
  if (target?.closest('button, a, input, textarea, select, label, [role="button"], [role="menu"]')) return false;
  return !window.getSelection?.()?.toString();
};

export interface TrackedBranchesSectionProps {
  trackedBranches?: PrTrackedBranch[];
  isOpen: boolean;
  onToggleSection: (sectionKey: string, nextOpen?: boolean) => void;
  // A smart group's icon and colour chosen in Settings › Appearance.
  icon?: { icon: IconName; tone: string };
  title?: string;
  // The branch shown in the detail pane (repo:branch), and showing one
  // there (its name clicked).
  selectedBranchKey?: string;
  onSelectBranch?: (repo: string, branch: string) => void;
  // The rows shown, in order (their keys): what the pane's previous and
  // next step through.
  onShownChange?: (keys: string[]) => void;
}

export function TrackedBranchesSection({
  trackedBranches = NO_BRANCHES,
  isOpen,
  onToggleSection,
  icon,
  title = 'Tracked Branches',
  selectedBranchKey = '',
  onSelectBranch,
  onShownChange,
}: TrackedBranchesSectionProps) {
  const { repos, branches: statuses, refresh } = useLocalBranches();
  const { showError } = useSnackbar();
  const searchTerms = useSearchTerms();
  const repoFilter = useContext(RowFilterSelectionContext)?.checkedByListId?.['repo-list'];
  const repoNames = useMemo(() => Array.from(repoFilter || []), [repoFilter]);
  const [showPicker, setShowPicker] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  // The note being written: whose (key), and its text so far.
  const [noteEditor, setNoteEditor] = useState<{ key: string; text: string; saving: boolean } | null>(null);
  // Notes saved here, shown until the data (the sources) has them.
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  useEffect(() => setSavedNotes({}), [trackedBranches]);
  // The row whose New branch form is open (its key).
  const [newFromKey, setNewFromKey] = useState('');
  // Pull, Fetch and what they (and New branch) did, for a while.
  const { pull, fetchBranch, pullingKey, fetchingKey, notice, setNotice } = useTrackedBranchActions();
  // The branch just untracked, for a while: Undo puts it back as it was.
  const [untracked, setUntracked] = useState<PrTrackedBranch | null>(null);
  useEffect(() => {
    if (!untracked) return undefined;
    const timer = window.setTimeout(() => setUntracked(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [untracked]);
  const sectionIcon = icon ?? BUILT_IN_SECTION_LOOKS[TRACKED_BRANCHES_SECTION_KEY];

  const shown = useMemo(
    () =>
      sortTrackedBranches(
        trackedBranches.filter((entry) => trackedBranchMatches(entry, statuses[trackedBranchKey(entry.repo, entry.branch)], { searchTerms, repoNames })),
        statuses,
      ),
    [trackedBranches, statuses, searchTerms, repoNames],
  );

  // Shown only while open: a closed section's rows aren't stepped through.
  const shownKeys = isOpen ? shown.map((entry) => trackedBranchKey(entry.repo, entry.branch)).join('\n') : '';
  useEffect(() => {
    onShownChange?.(shownKeys ? shownKeys.split('\n') : []);
  }, [shownKeys, onShownChange]);

  // The tracked list's own version, so the picker and the hint ask again
  // when it changes.
  const trackedVersion = useMemo(() => trackedBranches.map((entry) => trackedBranchKey(entry.repo, entry.branch)).join('\n'), [trackedBranches]);
  const cloneRepos = useReadableCloneRepos();
  const { byRepo: candidatesByRepo, refresh: refreshCandidates } = useBranchCandidates(isOpen ? [] : cloneRepos, trackedVersion);
  // A branch made since (in a terminal, an editor) counts once the page is
  // back in front.
  useEffect(() => {
    if (isOpen || cloneRepos.length === 0) return undefined;
    const onFocus = () => refreshCandidates();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isOpen, cloneRepos.length, refreshCandidates]);
  // Not the main branches: they're always there.
  const untrackedCount = isOpen ? 0 : Object.values(candidatesByRepo).reduce((sum, list) => sum + list.filter((branch) => !branch.main).length, 0);

  const checkedOutKey = trackedBranches
    .map((entry) => trackedBranchKey(entry.repo, entry.branch))
    .filter((key) => statuses[key]?.worktreePath)
    .join('\n');
  const changes = useTrackedBranchChanges(checkedOutKey);

  const untrack = async (entry: PrTrackedBranch) => {
    const key = trackedBranchKey(entry.repo, entry.branch);
    setBusyKey(key);
    try {
      const { response, result } = await sendJson<{ ok?: boolean; error?: string }>('DELETE', '/view-prs/tracked-branches', {
        repo: entry.repo,
        branch: entry.branch,
      });
      if (!response.ok || result.ok === false) showError(`Couldn't untrack ${entry.branch}`, result.error || `HTTP ${response.status}`);
      else {
        const note = noteOf(entry);
        setUntracked({ ...entry, ...(note ? { note } : { note: undefined }) });
        if (noteEditor?.key === key) setNoteEditor(null);
        refresh();
      }
    } catch (error) {
      showError(`Couldn't untrack ${entry.branch}`, error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey('');
    }
  };

  // Untrack's Undo: back as it was - its base, note and when it was first
  // tracked - whether or not this computer still has the branch.
  const undoUntrack = async () => {
    const entry = untracked;
    if (!entry) return;
    setUntracked(null);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>('/view-prs/tracked-branches', { ...entry, restore: true });
      if (!response.ok || result.ok === false) showError(`Couldn't track ${entry.branch} again`, result.error || `HTTP ${response.status}`);
      else refresh();
    } catch (error) {
      showError(`Couldn't track ${entry.branch} again`, error instanceof Error ? error.message : String(error));
    }
  };

  // A note shown (one saved here may be newer than the data's).
  const noteOf = (entry: PrTrackedBranch) => {
    const key = trackedBranchKey(entry.repo, entry.branch);
    return key in savedNotes ? (savedNotes[key] ?? '') : entry.note || '';
  };

  const saveNote = async (entry: PrTrackedBranch, text: string) => {
    const key = trackedBranchKey(entry.repo, entry.branch);
    // Once at a time, and only a change (Ctrl+Enter skips the button's check).
    if (noteEditor?.saving || text === noteOf(entry)) return;
    setNoteEditor({ key, text, saving: true });
    try {
      const { response, result } = await sendJson<{ ok?: boolean; error?: string }>('PATCH', '/view-prs/tracked-branches', {
        repo: entry.repo,
        branch: entry.branch,
        note: text,
      });
      if (!response.ok || result.ok === false) {
        showError(`Couldn't save the note on ${entry.branch}`, result.error || `HTTP ${response.status}`);
        setNoteEditor({ key, text, saving: false });
        return;
      }
      setSavedNotes((previous) => ({ ...previous, [key]: text.trim() ? text : '' }));
      setNoteEditor(null);
    } catch (error) {
      showError(`Couldn't save the note on ${entry.branch}`, error instanceof Error ? error.message : String(error));
      setNoteEditor({ key, text, saving: false });
    }
  };

  const openFolder = async (entry: PrTrackedBranch, folder: string, kind: OpenKind) => {
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>('/view-prs/open-folder', { repo: entry.repo, path: folder, with: kind });
      if (!response.ok || result.ok === false) {
        showError(kind === 'editor' ? "Couldn't open the editor" : "Couldn't open a terminal", result.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      showError(kind === 'editor' ? "Couldn't open the editor" : "Couldn't open a terminal", error instanceof Error ? error.message : String(error));
    }
  };

  const openWithPicker = () => {
    setShowPicker(true);
    if (!isOpen) onToggleSection(TRACKED_BRANCHES_SECTION_KEY, true);
  };

  const now = Date.now();
  return (
    <details
      className="pr-section tracked-branches-section"
      aria-label={title}
      data-pr-section={TRACKED_BRANCHES_SECTION_KEY}
      open={isOpen}
      onToggle={(event) => {
        const nextOpen = (event.target as HTMLDetailsElement).open;
        if (nextOpen !== isOpen) onToggleSection(TRACKED_BRANCHES_SECTION_KEY, nextOpen);
      }}
    >
      <summary className="pr-section-header">
        <Icon name="chevronRight" size={14} className="pr-section-chevron" />
        {sectionIcon && (
          <span className="pr-section-icon" data-tone={sectionIcon.tone}>
            <Icon name={sectionIcon.icon} />
          </span>
        )}
        <span className="pr-section-title">{title}</span>
        <span className="pr-section-count" title="Branches in this section">
          {shown.length}
        </span>
        {untrackedCount > 0 && (
          <button
            type="button"
            className="tracked-branches-hint"
            onClick={(event) => {
              // Not the summary's own toggle: this opens it with the picker.
              event.preventDefault();
              openWithPicker();
            }}
          >
            {untrackedCount} local branch{untrackedCount === 1 ? '' : 'es'} with no PR
          </button>
        )}
      </summary>

      <div className="pr-section-content">
        <div className="tracked-branches-toolbar">
          <Button icon="plus" pressed={showPicker} onClick={() => setShowPicker((value) => !value)}>
            Track a branch
          </Button>
        </div>
        {notice && (
          <p className="tracked-branches-notice" role="status">
            <span>{notice.text}</span>
            {notice.repo && notice.folder && <OpenFolderButtons repo={notice.repo} folder={notice.folder} />}
          </p>
        )}
        {untracked && (
          <p className="tracked-branches-undo" role="status">
            <span>
              Untracked {untracked.branch}
              {untracked.note ? ' (and its note)' : ''}.
            </span>
            <Button onClick={() => void undoUntrack()}>Undo</Button>
          </p>
        )}
        {showPicker && (
          <div className="tracked-branches-picker">
            <TrackBranchPicker version={trackedVersion} />
          </div>
        )}
        {shown.length === 0 ? (
          <p className="pr-section-empty">
            {trackedBranches.length === 0
              ? 'No branches tracked yet. Track a branch picks from your clones’ local branches that have no PR.'
              : 'No tracked branches match the search or repo filter.'}
          </p>
        ) : (
          <table className="tracked-branches-table" aria-label={title}>
            <thead>
              <tr>
                <th scope="col">Branch</th>
                <th scope="col">Where</th>
                <th scope="col">Status</th>
                <th scope="col">Last commit</th>
                <th scope="col">
                  <span className="ui-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => {
                const key = trackedBranchKey(entry.repo, entry.branch);
                const status = statuses[key];
                const hasClone = Boolean(repos[entry.repo]);
                const where = describeBranchWhere(status, hasClone);
                const chips = describeBranchChips(status, changes[key]);
                const folder = status?.worktreePath || '';
                const age = formatCommitAge(formatShortAge(status?.committedAt, now));
                const note = noteOf(entry);
                const editing = noteEditor?.key === key ? noteEditor : null;
                const editNote = () => setNoteEditor({ key, text: note, saving: false });
                return (
                  <Fragment key={key}>
                  <tr
                    className="tracked-branch-row"
                    data-branch-key={key}
                    data-selectable={onSelectBranch ? true : undefined}
                    aria-current={selectedBranchKey === key ? true : undefined}
                    onClick={(event) => {
                      if (onSelectBranch && isRowClick(event)) onSelectBranch(entry.repo, entry.branch);
                    }}
                  >
                    <td className="tracked-branch-name-cell">
                      <div className="tracked-branch-name-inner">
                      <div className="tracked-branch-name-text">
                      {onSelectBranch ? (
                        <button
                          type="button"
                          className="tracked-branch-name tracked-branch-open"
                          title={selectedBranchKey === key ? 'Close its details' : 'Show its commits and details'}
                          aria-pressed={selectedBranchKey === key}
                          onClick={() => onSelectBranch(entry.repo, entry.branch)}
                        >
                          {entry.branch}
                        </button>
                      ) : (
                        <span className="tracked-branch-name">{entry.branch}</span>
                      )}
                      <span className="tracked-branch-repo">{entry.repo}</span>
                      </div>
                      {note && editing ? (
                        // No hover text while it's being written: that would
                        // take the first Escape (tooltip-controller.ts).
                        <button type="button" className="tracked-branch-note" aria-label={`Note: ${note}`} aria-expanded onClick={() => setNoteEditor(null)}>
                          <Icon name="note" size={14} />
                        </button>
                      ) : note ? (
                        <Tooltip content={`${note}\n(click to edit)`}>
                          <button type="button" className="tracked-branch-note" aria-label={`Note: ${note}`} aria-expanded={false} onClick={editNote}>
                            <Icon name="note" size={14} />
                          </button>
                        </Tooltip>
                      ) : (
                        !editing && (
                          <IconButton className="tracked-branch-add-note" icon="pencil" label={`Add a note to ${entry.branch}`} onClick={editNote} />
                        )
                      )}
                      </div>
                    </td>
                    <td className="tracked-branch-where">
                      <Tooltip content={where.hint}>
                        <span tabIndex={0}>{where.text}</span>
                      </Tooltip>
                    </td>
                    <td className="tracked-branch-status">
                      {chips.length === 0 ? (
                        <span className="tracked-branch-quiet">{status?.found ? 'Up to date' : ''}</span>
                      ) : (
                        <span className="tracked-branch-chips">
                          {chips.map((chip) => (
                            <Tooltip key={chip.key} content={chip.hint}>
                              <span className="tracked-branch-chip" data-tone={chip.tone} tabIndex={0}>
                                {chip.text}
                              </span>
                            </Tooltip>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="tracked-branch-commit">
                      {status?.found && (
                        <Tooltip content={[status.subject, status.committedAt ? new Date(status.committedAt).toLocaleString() : ''].filter(Boolean).join('\n') || 'No commit'}>
                          <span tabIndex={0}>{age || '–'}</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="tracked-branch-actions">
                      <div className="tracked-branch-actions-inner">
                      {status?.found && status.upstream && !status.upstream.gone && (
                        <IconButton
                          icon="refresh"
                          label={`Fetch ${entry.branch}`}
                          hint={`Fetch ${status.upstream.remote}/${status.upstream.branch}, so how far behind it is is current - ${entry.branch} itself isn't changed`}
                          disabled={fetchingKey === key}
                          onClick={() => void fetchBranch(entry)}
                        />
                      )}
                      {status?.found && status.upstream && !status.upstream.gone && (
                        <IconButton
                          icon="arrowDown"
                          label={`Pull ${entry.branch}`}
                          hint={`Fetch ${status.upstream.remote}/${status.upstream.branch} and fast-forward ${entry.branch} to it (asks first)`}
                          disabled={pullingKey === key}
                          onClick={() => void pull(entry)}
                        />
                      )}
                      {status?.found && hasClone && (
                        <IconButton
                          icon="branch"
                          label={`New branch from ${entry.branch}`}
                          hint="Make a new branch from it, in a new worktree or the clone's folder, and track it"
                          pressed={newFromKey === key}
                          onClick={() => setNewFromKey((current) => (current === key ? '' : key))}
                        />
                      )}
                      {folder && (
                        <>
                          <Button aria-label={`Open ${entry.branch} in the editor`} title={`Open ${folder} in the editor`} onClick={() => void openFolder(entry, folder, 'editor')}>
                            Editor
                          </Button>
                          <Button aria-label={`Open a terminal in ${entry.branch}'s folder`} title={`Open a terminal in ${folder}`} onClick={() => void openFolder(entry, folder, 'terminal')}>
                            Terminal
                          </Button>
                        </>
                      )}
                      <IconButton icon="close" label={`Untrack ${entry.branch}`} hint="Stops tracking it; the branch itself is untouched" disabled={busyKey === key} onClick={() => void untrack(entry)} />
                      </div>
                    </td>
                  </tr>
                  {newFromKey === key && status?.found && (
                    <tr className="tracked-branch-note-row">
                      <td colSpan={5}>
                        <NewBranchForm
                          repo={entry.repo}
                          start={{ ref: `refs/heads/${entry.branch}`, name: entry.branch }}
                          onCancel={() => setNewFromKey('')}
                          onDone={(result) => {
                            setNewFromKey('');
                            setNotice({ text: describeNewBranch(result), repo: entry.repo, folder: result.worktreePath });
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  {editing && (
                    <tr className="tracked-branch-note-row">
                      <td colSpan={5}>
                        <form
                          className="tracked-branch-note-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveNote(entry, editing.text);
                          }}
                        >
                          <textarea
                            aria-label={`Note on ${entry.branch}`}
                            value={editing.text}
                            maxLength={MAX_NOTE_LENGTH}
                            rows={2}
                            autoFocus
                            placeholder="What it's for, what's left to do…"
                            readOnly={editing.saving}
                            onChange={(event) => setNoteEditor({ key, text: event.target.value, saving: false })}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setNoteEditor(null);
                              } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                                event.preventDefault();
                                void saveNote(entry, editing.text);
                              }
                            }}
                          />
                          <div className="tracked-branch-note-actions">
                            <Button type="submit" disabled={editing.saving || editing.text === note}>
                              {editing.saving ? 'Saving…' : 'Save note'}
                            </Button>
                            <Button onClick={() => setNoteEditor(null)} disabled={editing.saving}>
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
