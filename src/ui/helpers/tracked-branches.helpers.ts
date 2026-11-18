// Branches tracked without a PR (Tracked Branches): their keys, what each
// row says about one, and which the page's search and repo filter let
// through. The list is the sources file's trackedBranches (the data's
// dataMeta.sources); each one's state is this computer's clone's (GET
// /view-prs/local-branches' branches, TrackedBranchStatus).

import type { PrTrackedBranch } from '../types/pr-data.ts';
import type { TrackedBranchStatus } from '../state/LocalBranchesContext';

// repo:branch - git allows no ":" in a branch name.
export const trackedBranchKey = (repo: string, branch: string) => `${repo}:${branch}`;

// The uncommitted changes in a branch's worktree (GET
// /view-prs/tracked-branches/changes).
export interface TrackedBranchChanges {
  worktreePath?: string;
  staged?: number;
  changed?: number;
  untracked?: number;
  conflicted?: number;
  total?: number;
  files?: Array<{ path: string; code: string }>;
  error?: string;
}

export type BranchChipTone = 'attention' | 'danger' | 'accent' | 'muted' | 'success';

// One of a row's status chips: its short text, its colour, and what it
// means (the hover text).
export interface BranchChip {
  key: string;
  text: string;
  tone: BranchChipTone;
  hint: string;
}

// How long ago a commit was: "just now", "5m ago", "3d ago"; "" for none.
export const formatCommitAge = (age: string) => (!age ? '' : age === 'now' ? 'just now' : `${age} ago`);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Where the branch is: checked out in a worktree (its folder's last part),
// not checked out, or not on this computer.
export const describeBranchWhere = (status: TrackedBranchStatus | undefined, hasClone: boolean): { text: string; hint: string } => {
  if (!hasClone) return { text: 'Not on this computer', hint: 'No clone of its repo is saved in Settings › Local clones on this computer' };
  if (!status) return { text: 'Not read yet', hint: "Its clone hasn't been read yet, or couldn't be (Settings › Local clones says why)" };
  if (!status.found) return { text: 'Branch not found', hint: "The clone has no local branch of this name (deleted or renamed?). Untrack it if it's gone." };
  if (status.worktreePath) {
    const folder = status.worktreePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || status.worktreePath;
    return { text: folder, hint: `Checked out in ${status.worktreePath}${status.rebasing ? ' (mid-rebase)' : ''}` };
  }
  return { text: 'Not checked out', hint: 'The branch is in the clone but not checked out in any folder' };
};

// The row's status chips, most pressing first: uncommitted changes,
// conflicts, what isn't pushed, behind its upstream, an upstream gone, and
// ahead/behind its base; a PR that has opened for it.
export const describeBranchChips = (status: TrackedBranchStatus | undefined, changes?: TrackedBranchChanges | null): BranchChip[] => {
  if (!status?.found) return [];
  const chips: BranchChip[] = [];
  if (status.pr) {
    chips.push({
      key: 'pr',
      text: `PR #${status.pr.number}${status.pr.done ? ' done' : ' opened'}`,
      tone: status.pr.done ? 'muted' : 'success',
      hint: status.pr.done
        ? `PR #${status.pr.number} for this branch is merged or closed - untrack it when you're done with it`
        : `PR #${status.pr.number} is open for this branch - it's in the PR sections now`,
    });
  }
  if (status.rebasing) chips.push({ key: 'rebasing', text: 'Rebasing', tone: 'attention', hint: 'Its worktree is mid-rebase (stopped on a conflict, or at an edit)' });
  if (changes?.error) chips.push({ key: 'changes-error', text: "Can't read changes", tone: 'muted', hint: changes.error });
  else if (changes && (changes.conflicted || 0) > 0) {
    chips.push({ key: 'conflicts', text: plural(changes.conflicted || 0, 'conflict'), tone: 'danger', hint: 'Files with merge conflicts in its worktree' });
  }
  if (changes && !changes.error && (changes.total || 0) > 0) {
    const parts = [
      changes.staged ? `${changes.staged} staged` : '',
      changes.changed ? `${changes.changed} changed` : '',
      changes.untracked ? `${changes.untracked} new` : '',
    ].filter(Boolean);
    const files = (changes.files || []).map((file) => `${file.code.trim() || '?'} ${file.path}`);
    chips.push({
      key: 'uncommitted',
      text: `${changes.total} uncommitted`,
      tone: 'attention',
      hint: [`Uncommitted: ${parts.join(', ') || plural(changes.total || 0, 'file')}`, ...files.slice(0, 20), ...(files.length > 20 ? [`and ${files.length - 20} more`] : [])].join('\n'),
    });
  }
  if (typeof status.unpushed === 'number' && status.unpushed > 0) {
    chips.push({
      key: 'unpushed',
      text: status.upstream ? `${status.unpushed} not pushed` : `Local only · ${plural(status.unpushed, 'commit')}`,
      tone: 'attention',
      hint: `${plural(status.unpushed, 'commit')} on none of the repo's remote branches (as the clone last fetched them)`,
    });
  } else if (status.pushed && !status.upstream && (status.baseAhead ?? 1) > 0) {
    // Only for commits of its own: a branch still where its base was is
    // "on a remote branch" just by being its base's commit.
    chips.push({
      key: 'pushed',
      text: 'On a remote branch',
      tone: 'muted',
      hint: "Its own commits are on one of the repo's remote branches, though it tracks none (pushed without setting an upstream?)",
    });
  }
  if (status.upstream?.gone) {
    chips.push({
      key: 'upstream-gone',
      text: 'Remote branch gone',
      tone: 'muted',
      hint: `It tracks ${status.upstream.remote}/${status.upstream.branch}, which the clone no longer has (deleted on GitHub and pruned, or never fetched)`,
    });
  } else if (status.upstream && (status.upstream.behind || 0) > 0) {
    chips.push({
      key: 'behind-upstream',
      text: `${status.upstream.behind} behind`,
      tone: 'attention',
      hint: `${plural(status.upstream.behind || 0, 'commit')} on ${status.upstream.remote}/${status.upstream.branch} not in it (as of the clone's last fetch) - Pull would bring them`,
    });
  }
  if (status.base) {
    if (status.baseMissing) {
      chips.push({ key: 'base', text: `No ${status.base}`, tone: 'muted', hint: `The clone has no branch ${status.base} to compare with` });
    } else if (typeof status.baseAhead === 'number' && typeof status.baseBehind === 'number') {
      chips.push({
        key: 'base',
        // Nothing of its own, said plainly rather than "0 ahead": on the
        // base's commit, nothing yet; behind it, everything it has is in
        // the base - never committed to, or merged (which can't be told).
        text:
          status.baseAhead === 0
            ? status.baseBehind > 0
              ? `All in ${status.base} · ${status.baseBehind} behind`
              : 'No commits yet'
            : `${status.baseAhead} ahead, ${status.baseBehind} behind ${status.base}`,
        tone: status.baseBehind > 0 ? 'accent' : 'muted',
        hint: `Against ${status.base} as the clone has it (its copy of the remote's, as of the last fetch): ${plural(status.baseAhead, 'commit')} of its own, ${plural(status.baseBehind, 'commit')} on ${status.base} it hasn't got`,
      });
    }
  }
  return chips;
};

// The words of the search (lowercase), each found in the branch's name,
// repo, note or newest commit's subject - and its repo one of the repo
// filter's, when that has any.
export const trackedBranchMatches = (
  entry: PrTrackedBranch,
  status: TrackedBranchStatus | undefined,
  { searchTerms = [], repoNames = [] }: { searchTerms?: ReadonlyArray<string>; repoNames?: ReadonlyArray<string> } = {},
): boolean => {
  if (repoNames.length > 0 && !repoNames.some((repo) => repo.toLowerCase() === entry.repo.toLowerCase())) return false;
  if (searchTerms.length === 0) return true;
  const text = [entry.branch, entry.repo, entry.note || '', status?.subject || ''].join('\n').toLowerCase();
  return searchTerms.every((term) => text.includes(String(term).toLowerCase()));
};

// The tracked branches in view, newest commit first (those this computer
// hasn't got last, by name).
export const sortTrackedBranches = (
  entries: ReadonlyArray<PrTrackedBranch>,
  statuses: Record<string, TrackedBranchStatus>,
): PrTrackedBranch[] =>
  [...entries].sort((a, b) => {
    const at = (entry: PrTrackedBranch) => statuses[trackedBranchKey(entry.repo, entry.branch)]?.committedAt || '';
    return at(b).localeCompare(at(a)) || a.repo.localeCompare(b.repo) || a.branch.localeCompare(b.branch);
  });
