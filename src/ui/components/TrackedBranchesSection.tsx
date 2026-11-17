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

import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PrTrackedBranch } from '../types/pr-data.ts';
import { Icon, type IconName } from './ui/Icon';
import { Button, IconButton } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TrackBranchPicker, useBranchCandidates, useReadableCloneRepos } from './TrackBranchPicker';
import { useLocalBranches } from '../state/LocalBranchesContext';
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
function useTrackedBranchChanges(checkedOutKey: string, pollMs = CHANGES_POLL_MS) {
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

export interface TrackedBranchesSectionProps {
  trackedBranches?: PrTrackedBranch[];
  isOpen: boolean;
  onToggleSection: (sectionKey: string, nextOpen?: boolean) => void;
  // A smart group's icon and colour chosen in Settings › Appearance.
  icon?: { icon: IconName; tone: string };
  title?: string;
}

export function TrackedBranchesSection({
  trackedBranches = NO_BRANCHES,
  isOpen,
  onToggleSection,
  icon,
  title = 'Tracked Branches',
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
  const untrackedCount = isOpen ? 0 : Object.values(candidatesByRepo).reduce((sum, list) => sum + list.length, 0);

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
        setUntracked(entry);
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

  const saveNote = async (entry: PrTrackedBranch, text: string) => {
    const key = trackedBranchKey(entry.repo, entry.branch);
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
                const note = key in savedNotes ? savedNotes[key] ?? '' : entry.note || '';
                const editing = noteEditor?.key === key ? noteEditor : null;
                const editNote = () => setNoteEditor({ key, text: note, saving: false });
                return (
                  <Fragment key={key}>
                  <tr className="tracked-branch-row" data-branch-key={key}>
                    <td className="tracked-branch-name-cell">
                      <span className="tracked-branch-name">{entry.branch}</span>
                      <span className="tracked-branch-repo">{entry.repo}</span>
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
