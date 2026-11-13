import { useState } from 'react';
import { describeLocalBranch, useLocalBranch, type LocalBranchInfo } from '../state/LocalBranchesContext';
import { useSnackbar } from '../state/SnackbarContext';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';

// The hover text: where it is, and what the count compares.
const describeInDetail = (info: LocalBranchInfo) => {
  const where = info.worktreePath ? `Checked out in ${info.worktreePath}` : 'Not checked out in a worktree';
  const how = info.diverged
    ? "Its newest commit isn't one of the PR's, and the PR's newest isn't in the clone - fetch to compare."
    : info.exact === false
      ? "Behind by the PR's commits after the local one (the PR's newest isn't in the clone yet - fetch for an exact count; merges from the base branch aren't counted)."
      : 'Compared with the PR’s newest commit as last fetched.';
  return `Local branch ${info.branch} (${info.oid.slice(0, 7)}).\n${where}.\n${how}`;
};

// Behind or differing: something to pull.
const toneOf = (info: LocalBranchInfo) => (info.diverged || (info.behind || 0) > 0 ? 'attention' : undefined);

/**
 * The row's "Local · 2 behind" chip, on a line of its own under the title,
 * when this computer has the PR's branch (Settings › Local clones). Its own
 * component, so a new check re-renders the chips, not the rows.
 */
export function PrLocalBranchChip({ repo, prNumber }: { repo: string; prNumber: string }) {
  const info = useLocalBranch(repo, prNumber);
  if (!info) return null;
  return (
    <div className="pr-title-meta">
      <span className="pr-meta-chip pr-local-branch" data-tone={toneOf(info)} title={describeInDetail(info)}>
        <Icon name="branch" size={12} />
        Local · {describeLocalBranch(info)}
      </span>
    </div>
  );
}

/**
 * The pane's "On this computer" line: the local branch, ahead/behind, the
 * worktree it's checked out in, and Open in editor (VS Code's `code`, run
 * by the server for the worktree's folder).
 */
export function PrLocalBranchLine({ repo, prNumber }: { repo: string; prNumber: string }) {
  const info = useLocalBranch(repo, prNumber);
  const { showError } = useSnackbar();
  const [opening, setOpening] = useState(false);
  if (!info) return null;

  const open = async () => {
    if (!info.worktreePath) return;
    setOpening(true);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>('/view-prs/open-in-editor', {
        repo,
        path: info.worktreePath,
      });
      if (!response.ok || result.ok === false) showError("Couldn't open the editor", result.error || `HTTP ${response.status}`);
    } catch (caught) {
      showError("Couldn't open the editor", caught instanceof Error ? caught.message : String(caught));
    } finally {
      setOpening(false);
    }
  };

  return (
    <p className="pr-pane-local" data-tone={toneOf(info)}>
      <span className="pr-pane-local-text" title={describeInDetail(info)}>
        <Icon name="branch" size={12} />
        On this computer: <code>{info.branch}</code> · {describeLocalBranch(info)}
        {info.worktreePath ? (
          <>
            {' '}
            in <code className="pr-pane-local-path">{info.worktreePath}</code>
          </>
        ) : (
          ' · not checked out'
        )}
      </span>
      {info.worktreePath && (
        <Button disabled={opening} onClick={() => void open()}>
          {opening ? 'Opening…' : 'Open in editor'}
        </Button>
      )}
    </p>
  );
}
