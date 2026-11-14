import { useState } from 'react';
import {
  describeLocalBranch,
  useLocalBranch,
  useLocalBranches,
  type LocalBranchInfo,
  type LocalRepoCheckout,
} from '../state/LocalBranchesContext';
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

interface CheckoutResult {
  ok?: boolean;
  error?: string;
  branch?: string;
  worktreePath?: string;
  warning?: string;
}

// The end of what a failed checkout printed, for the snackbar.
const lastLines = (text: string | undefined, count = 3) =>
  String(text || '')
    .trim()
    .split(/\r?\n/)
    .slice(-count)
    .join('\n');

/**
 * What Check out will do, as the server decides it
 * (view-prs-local-checkout.js): a local branch the clone has for the PR is
 * given a worktree by git as it is; else the repo's checkout command, if it
 * has one and it's for this PR (a fork's only if the settings say); else
 * git - then the after-command, for a worktree git makes.
 */
export const describeCheckOut = ({
  info,
  checkout,
  isFork,
  prNumber,
}: {
  info: LocalBranchInfo | null | undefined;
  checkout: LocalRepoCheckout | undefined;
  isFork: boolean;
  prNumber: string;
}) => {
  const then = checkout?.after ? `, then ${checkout.after}` : '';
  if (info) {
    const state = describeLocalBranch(info);
    const stale = Boolean(info.diverged) || (info.behind || 0) > 0;
    return `A worktree for your branch ${info.branch} as it is (${state.charAt(0).toLowerCase()}${state.slice(1)}), with git${then}${
      stale ? " - the PR's newer commits aren't fetched" : ''
    }`;
  }
  if (checkout?.command && (!isFork || checkout.forks === true)) return `A worktree for the PR's branch, with ${checkout.command}`;
  return `A worktree for ${isFork ? `pr-${prNumber}, the fork's PR` : "the PR's branch"}, with git${then}`;
};

/**
 * The pane's "On this computer" line: the local branch, ahead/behind, the
 * worktree it's checked out in, and Open in editor (VS Code's `code`, run
 * by the server for the worktree's folder). An open PR not checked out in
 * a worktree has Check out: a worktree for its branch, made as the repo's
 * checkout settings say (Settings › Local clones) - by the user's own
 * command, or with git.
 */
export function PrLocalBranchLine({
  repo,
  prNumber,
  canCheckOut = false,
  isFork = false,
}: {
  repo: string;
  prNumber: string;
  canCheckOut?: boolean;
  // A fork's PR (or one from a branch named as its base).
  isFork?: boolean;
}) {
  const info = useLocalBranch(repo, prNumber);
  const { repos, refresh } = useLocalBranches();
  const clone = repos[repo];
  const { showError, showWarning } = useSnackbar();
  const [opening, setOpening] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  // The worktree just made, until the next check shows it - this PR's only,
  // should the pane move on to another.
  const [madeFor, setMade] = useState<{ key: string; branch: string; worktreePath: string } | null>(null);
  const made = madeFor?.key === `${repo}#${prNumber}` ? madeFor : null;
  const worktreePath = info?.worktreePath || made?.worktreePath || '';
  const offerCheckOut = canCheckOut && Boolean(clone?.ok) && !worktreePath;
  if (!info && !made && !offerCheckOut) return null;

  const open = async () => {
    const folder = worktreePath;
    if (!folder) return;
    setOpening(true);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string }>('/view-prs/open-in-editor', {
        repo,
        path: folder,
      });
      if (!response.ok || result.ok === false) showError("Couldn't open the editor", result.error || `HTTP ${response.status}`);
    } catch (caught) {
      showError("Couldn't open the editor", caught instanceof Error ? caught.message : String(caught));
    } finally {
      setOpening(false);
    }
  };

  const checkOut = async () => {
    setCheckingOut(true);
    try {
      const { response, result } = await postJson<CheckoutResult & { output?: string }>('/view-prs/local-branches/checkout', {
        repo,
        number: prNumber,
      });
      if (!response.ok || result.ok === false || !result.worktreePath) {
        const detail = [result.error || `HTTP ${response.status}`, lastLines(result.output)].filter(Boolean).join('\n');
        showError("Couldn't check it out", detail);
        return;
      }
      setMade({ key: `${repo}#${prNumber}`, branch: result.branch || '', worktreePath: result.worktreePath });
      if (result.warning) showWarning('Checked out, but…', result.warning);
      refresh();
    } catch (caught) {
      showError("Couldn't check it out", caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <p className="pr-pane-local" data-tone={info ? toneOf(info) : undefined}>
      <span className="pr-pane-local-text" title={info ? describeInDetail(info) : undefined}>
        <Icon name="branch" size={12} />
        On this computer:{' '}
        {info ? (
          <>
            <code>{info.branch}</code> · {describeLocalBranch(info)}
          </>
        ) : made ? (
          <code>{made.branch}</code>
        ) : (
          'not checked out'
        )}
        {worktreePath ? (
          <>
            {' '}
            in <code className="pr-pane-local-path">{worktreePath}</code>
          </>
        ) : (
          info && ' · not checked out'
        )}
      </span>
      {worktreePath && (
        <Button disabled={opening} onClick={() => void open()}>
          {opening ? 'Opening…' : 'Open in editor'}
        </Button>
      )}
      {offerCheckOut && (
        <Button
          disabled={checkingOut}
          title={describeCheckOut({ info, checkout: clone?.checkout, isFork, prNumber })}
          onClick={() => void checkOut()}
        >
          {checkingOut ? 'Checking out…' : 'Check out'}
        </Button>
      )}
    </p>
  );
}
