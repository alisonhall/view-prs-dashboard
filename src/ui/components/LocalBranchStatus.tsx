import { useEffect, useState } from 'react';
import {
  describeLocalBranch,
  useCheckoutPlan,
  useLocalBranch,
  useLocalBranches,
  type CheckoutPlan,
  type LocalBranchInfo,
  type LocalRepoStatus,
} from '../state/LocalBranchesContext';
import { useSnackbar } from '../state/SnackbarContext';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { checkoutCommandFor } from '../helpers/checkout-command.helpers.ts';

const NAME_ONLY_NOTE = "It has the PR's branch's name but tracks no remote branch, so it may not be the PR's code.";

// The hover text: where it is, and what the count compares.
const describeInDetail = (info: LocalBranchInfo) => {
  const where = info.worktreePath
    ? `Checked out in ${info.worktreePath}${info.rebasing ? ', a rebase in progress there (git rebase --continue or --abort)' : ''}`
    : 'Not checked out in a worktree';
  const how = info.diverged
    ? "Its newest commit isn't one of the PR's, and the PR's newest isn't in the clone - fetch to compare."
    : info.exact === false
      ? "Behind by the PR's commits after the local one (the PR's newest isn't in the clone yet - fetch for an exact count; merges from the base branch aren't counted)."
      : 'Compared with the PR’s newest commit as last fetched.';
  return `Local branch ${info.branch} (${info.oid.slice(0, 7)}).\n${where}.\n${how}${info.nameOnly ? `\n${NAME_ONLY_NOTE}` : ''}`;
};

// Behind or differing: something to pull - not for a branch that only has
// the PR's branch's name, which may not be the PR's at all.
const toneOf = (info: LocalBranchInfo) => (!info.nameOnly && (info.diverged || (info.behind || 0) > 0) ? 'attention' : undefined);

/**
 * The row's "Local · 2 behind" chip, on a line of its own under the title,
 * when this computer has the PR's branch (Settings › Local clones) - "same
 * name only", muted, for a branch found by its name alone. Its own
 * component, so a new check re-renders the chips, not the rows.
 */
export function PrLocalBranchChip({ repo, prNumber }: { repo: string; prNumber: string }) {
  const info = useLocalBranch(repo, prNumber);
  if (!info) return null;
  return (
    <div className="pr-title-meta">
      <span
        className="pr-meta-chip pr-local-branch"
        data-tone={toneOf(info)}
        data-name-only={info.nameOnly ? 'true' : undefined}
        title={describeInDetail(info)}
      >
        <Icon name="branch" size={12} />
        Local · {describeLocalBranch(info)}
        {info.nameOnly && ' · same name only'}
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
  output?: string;
}

// The end of what a failed checkout printed, for the snackbar.
const lastLines = (text: string | undefined, count = 3) =>
  String(text || '')
    .trim()
    .split(/\r?\n/)
    .slice(-count)
    .join('\n');

/**
 * What Check out will do, as the server will do it (its plan, from GET
 * /view-prs/local-branches): a local branch the clone has for the PR is
 * given a worktree by git as it is; otherwise the repo's checkout command,
 * or git - then the after-command, for a worktree git makes.
 */
export const describeCheckOut = ({
  info,
  plan,
  command,
  after,
  prNumber,
}: {
  info: LocalBranchInfo | null | undefined;
  plan: CheckoutPlan | null | undefined;
  command: string | undefined;
  after: string | undefined;
  prNumber: string;
}) => {
  const then = after ? `, then ${after}` : '';
  if (info) {
    const state = describeLocalBranch(info);
    const stale = Boolean(info.diverged) || (info.behind || 0) > 0;
    return `A worktree for your branch ${info.branch} as it is (${state.charAt(0).toLowerCase()}${state.slice(1)}${
      info.nameOnly ? ", same name only - it doesn't track the PR's branch" : ''
    }), with git${then}${stale ? " - the PR's newer commits aren't fetched" : ''}`;
  }
  if (plan?.how === 'command' && command) return `A worktree for the PR's branch, with ${command}`;
  return `A worktree for ${plan?.fork ? `pr-${prNumber}, the fork's PR` : "the PR's branch"}, with git${then}`;
};

// Seconds since a time, every second while on - for a slow checkout.
const useElapsedSeconds = (on: boolean) => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!on) {
      setSeconds(0);
      return undefined;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [on]);
  return seconds;
};

// The uncommitted changes in a PR's worktree (GET
// /view-prs/local-branches/changes): counts, and the first files with git
// status's two-letter code - or why git couldn't read it.
export interface WorktreeChanges {
  worktreePath: string;
  staged?: number;
  changed?: number;
  untracked?: number;
  conflicted?: number;
  total?: number;
  files?: { path: string; code: string }[];
  error?: string;
}

const CHANGES_POLL_MS = 60 * 1000;

/**
 * The worktree's uncommitted changes, for the pane's one PR (a git status
 * is too slow for every row): asked for when its worktree is known or the
 * local branch changes, when the window's focused again (back from the
 * editor) and every minute while the page shows. null until answered, and
 * with no worktree. An answer for a PR the pane has moved on from is
 * dropped.
 */
export const useWorktreeChanges = (repo: string, prNumber: string, worktreePath: string, branchOid: string, pollMs = CHANGES_POLL_MS) => {
  const key = `${repo}#${prNumber}`;
  const [answer, setAnswer] = useState<{ key: string; worktreePath: string; changes: WorktreeChanges | null } | null>(null);
  useEffect(() => {
    if (!worktreePath) return undefined;
    let live = true;
    const load = async () => {
      try {
        const query = new URLSearchParams({ repo, number: prNumber });
        const response = await fetch(`/view-prs/local-branches/changes?${query}`, { cache: 'no-store' });
        if (!response.ok) return;
        const result = (await response.json()) as { changes?: WorktreeChanges | null };
        if (!live) return;
        const changes = result.changes || null;
        setAnswer((previous) =>
          previous?.key === key && previous.worktreePath === worktreePath && JSON.stringify(previous.changes) === JSON.stringify(changes)
            ? previous
            : { key, worktreePath, changes },
        );
      } catch (_error) {
        // Next time.
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, pollMs);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [key, repo, prNumber, worktreePath, branchOid, pollMs]);
  return worktreePath && answer?.key === key && answer.worktreePath === worktreePath ? answer.changes : null;
};

// "2 staged, 1 changed, 3 new, 1 conflicted" - each count there is.
export const describeWorktreeChanges = (changes: WorktreeChanges) =>
  [
    changes.conflicted ? `${changes.conflicted} conflicted` : '',
    changes.staged ? `${changes.staged} staged` : '',
    changes.changed ? `${changes.changed} changed` : '',
    changes.untracked ? `${changes.untracked} new` : '',
  ]
    .filter(Boolean)
    .join(', ');

// The hover text: each file listed, as git status --short prints it.
const listChangedFiles = (changes: WorktreeChanges) => {
  const files = changes.files || [];
  const more = (changes.total || 0) - files.length;
  return [
    `Not committed in ${changes.worktreePath}:`,
    ...files.map((file) => `${file.code} ${file.path}`),
    ...(more > 0 ? [`…and ${more} more`] : []),
  ].join('\n');
};

/**
 * The pane's line under "On this computer" for a worktree with uncommitted
 * changes: what kinds, each file in its hover text - conflicts (a merge or
 * rebase stopped part way) in the attention colour. Nothing when it's
 * clean; "can't be read" with git's reason when it can't.
 */
function WorktreeChangesLine({ changes }: { changes: WorktreeChanges | null }) {
  if (!changes) return null;
  if (changes.error) {
    return (
      <p className="pr-pane-local pr-pane-local-changes">
        <span className="pr-pane-local-text" title={`${changes.worktreePath}: ${changes.error}`}>
          <Icon name="alert" size={12} />
          The worktree can&apos;t be read
        </span>
      </p>
    );
  }
  if (!changes.total) return null;
  return (
    <p className="pr-pane-local pr-pane-local-changes" data-tone={changes.conflicted ? 'attention' : undefined}>
      <span className="pr-pane-local-text" title={listChangedFiles(changes)}>
        <Icon name={changes.conflicted ? 'mergeConflict' : 'pencil'} size={12} />
        Uncommitted: {describeWorktreeChanges(changes)}
      </span>
    </p>
  );
}

// Text onto the clipboard: the Clipboard API, else - on a page that isn't a
// secure context, as one opened from another computer over plain http
// (VIEW_PRS_HOST), which has no navigator.clipboard - the older copy
// command on a hidden text area. Whether it worked.
const copyText = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_error) {
    // The older way, then.
  }
  const focused = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  try {
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch (_error) {
    return false;
  } finally {
    area.remove();
    focused?.focus?.();
  }
};

/**
 * The line for an open PR whose repo has no clone here (none saved, or one
 * that can't be read): Copy checkout command - the commands on the
 * clipboard, "Copied" for a moment, and in its hover text with what they
 * assume. Where nothing can copy, the commands are shown under the line,
 * to select by hand.
 */
function CopyCommandLine({ command, clone }: { command: string; clone: LocalRepoStatus | undefined }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = window.setTimeout(() => setState('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [state]);
  const copy = async () => {
    const copied = await copyText(command);
    setState(copied ? 'copied' : 'error');
    if (!copied) setFailed(true);
  };
  return (
    <>
      <p className="pr-pane-local">
        {clone ? (
          // Saved, but unreadable (a drive not plugged in, a folder moved).
          <span className="pr-pane-local-text" title={`${clone.path}: ${clone.error || "it can't be read"}`}>
            <Icon name="branch" size={12} />
            On this computer: the clone can&apos;t be read
          </span>
        ) : (
          <span className="pr-pane-local-text">
            <Icon name="branch" size={12} />
            Not on this computer
          </span>
        )}
        <Button
          icon={state === 'copied' ? 'check' : 'copy'}
          title={`To paste into bash, zsh or Git Bash (not Windows PowerShell 5.1) in a clone of the repo, its remote for the repo named origin - a worktree beside it for the PR's branch:\n${command}`}
          onClick={() => void copy()}
        >
          {state === 'copied' ? 'Copied' : state === 'error' ? 'Copy unavailable' : 'Copy checkout command'}
        </Button>
      </p>
      {failed && (
        <div className="pr-pane-local-output">
          This browser won&apos;t copy here - select the commands to copy them:
          {/* One click selects it all. */}
          <pre aria-label="Checkout command" onClick={(event) => window.getSelection()?.selectAllChildren(event.currentTarget)}>
            {command}
          </pre>
        </div>
      )}
    </>
  );
}

/**
 * The pane's "On this computer" line: the local branch, ahead/behind, the
 * worktree it's checked out in, and Open in editor (VS Code's `code`, run
 * by the server for the worktree's folder). An open PR not checked out in
 * a worktree has Check out: a worktree for its branch, made as the repo's
 * checkout settings say (Settings › Local clones) - by the user's own
 * command, or with git - its time shown while it runs, and what it printed
 * kept under the line when it failed or warned. An open PR whose count is
 * an estimate (or can't be told) has Fetch: the PR's branch fetched into
 * the clone (no files change), then checked again. A PR checked out in a
 * worktree, merged and closed ones too, has a line under it for the
 * worktree's uncommitted changes, when it has any. One whose repo has no clone
 * here is "Not on this computer", with Copy checkout command: plain git to
 * paste into a terminal in a clone of it.
 */
export function PrLocalBranchLine({
  repo,
  prNumber,
  canCheckOut = false,
  branch,
  targetBranch,
  crossRepository,
}: {
  repo: string;
  prNumber: string;
  canCheckOut?: boolean;
  branch?: string;
  targetBranch?: string;
  crossRepository?: boolean;
}) {
  const key = `${repo}#${prNumber}`;
  const info = useLocalBranch(repo, prNumber);
  const plan = useCheckoutPlan(repo, prNumber);
  const { repos, refresh, loaded } = useLocalBranches();
  const clone = repos[repo];
  const { showError, showWarning } = useSnackbar();
  const [opening, setOpening] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [fetching, setFetching] = useState(false);
  const elapsed = useElapsedSeconds(checkingOut);
  // The worktree just made, until the next check shows it - and what a
  // checkout that failed or warned printed - this PR's only, should the
  // pane move on to another.
  const [madeFor, setMade] = useState<{ key: string; branch: string; worktreePath: string } | null>(null);
  const [outputFor, setOutput] = useState<{ key: string; text: string } | null>(null);
  const made = madeFor?.key === key ? madeFor : null;
  const output = outputFor?.key === key ? outputFor.text : '';
  const worktreePath = info?.worktreePath || made?.worktreePath || '';
  const offerCheckOut = canCheckOut && Boolean(clone?.ok) && !worktreePath;
  // Asked for once the server knows the worktree (a check after Check out),
  // as it finds the worktree itself.
  const changes = useWorktreeChanges(repo, prNumber, clone?.ok ? info?.worktreePath || '' : '', info?.oid || '');
  // The count's an estimate, or can't be told: the PR's newest commit isn't
  // in the clone - Fetch brings it (no files change).
  const offerFetch = canCheckOut && Boolean(clone?.ok) && Boolean(info && (info.exact === false || info.diverged));
  // No clone here to check it out in (none saved, or it can't be read): the
  // commands to paste into a terminal in one, wherever it is - once the
  // server has said which clones there are.
  const copyCommand = canCheckOut && loaded && !clone?.ok && !info && !made ? checkoutCommandFor({ repo, number: prNumber, branch, targetBranch, crossRepository }) : '';
  // Its own for each PR: not "Copied" for the next one shown.
  if (copyCommand) return <CopyCommandLine key={key} command={copyCommand} clone={clone} />;
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

  const fetchBranch = async () => {
    setFetching(true);
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; warning?: string; output?: string }>(
        '/view-prs/local-branches/fetch',
        { repo, number: prNumber },
      );
      if (!response.ok || result.ok === false) {
        showError("Couldn't fetch the PR's branch", [result.error || `HTTP ${response.status}`, lastLines(result.output)].filter(Boolean).join('\n'));
        return;
      }
      if (result.warning) showWarning('Fetched, but…', result.warning);
      refresh();
    } catch (caught) {
      showError("Couldn't fetch the PR's branch", caught instanceof Error ? caught.message : String(caught));
    } finally {
      setFetching(false);
    }
  };

  const checkOut = async () => {
    setCheckingOut(true);
    setOutput(null);
    try {
      const { response, result } = await postJson<CheckoutResult>('/view-prs/local-branches/checkout', {
        repo,
        number: prNumber,
      });
      if (!response.ok || result.ok === false || !result.worktreePath) {
        const detail = [result.error || `HTTP ${response.status}`, lastLines(result.output)].filter(Boolean).join('\n');
        showError("Couldn't check it out", detail);
        if (result.output) setOutput({ key, text: result.output });
        return;
      }
      setMade({ key, branch: result.branch || '', worktreePath: result.worktreePath });
      if (result.warning) {
        showWarning('Checked out, but…', result.warning);
        if (result.output) setOutput({ key, text: result.output });
      }
      refresh();
    } catch (caught) {
      showError("Couldn't check it out", caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <>
      <p className="pr-pane-local" data-tone={info ? toneOf(info) : undefined}>
        <span className="pr-pane-local-text" title={info ? describeInDetail(info) : undefined}>
          <Icon name="branch" size={12} />
          On this computer:{' '}
          {info ? (
            <>
              <code>{info.branch}</code>
              {info.nameOnly && <span className="pr-pane-local-name-only">(same name, not tracking the PR&apos;s branch)</span>} ·{' '}
              {describeLocalBranch(info)}
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
              {info?.rebasing && ' · rebase in progress'}
            </>
          ) : (
            info && ' · not checked out'
          )}
        </span>
        {offerFetch && (
          <Button
            disabled={fetching}
            title="Fetch the PR's branch into the clone, for an exact count - git fetch only: no files or local branches change"
            onClick={() => void fetchBranch()}
          >
            {fetching ? 'Fetching…' : 'Fetch'}
          </Button>
        )}
        {worktreePath && (
          <Button disabled={opening} onClick={() => void open()}>
            {opening ? 'Opening…' : 'Open in editor'}
          </Button>
        )}
        {offerCheckOut && (
          <Button
            disabled={checkingOut}
            title={describeCheckOut({ info, plan, command: clone?.checkout?.command, after: clone?.checkout?.after, prNumber })}
            onClick={() => void checkOut()}
          >
            {checkingOut ? `Checking out…${elapsed >= 2 ? ` ${elapsed}s` : ''}` : 'Check out'}
          </Button>
        )}
      </p>
      <WorktreeChangesLine changes={changes} />
      {output && (
        <details className="pr-pane-local-output">
          <summary>What the checkout printed</summary>
          <pre>{output}</pre>
        </details>
      )}
    </>
  );
}
