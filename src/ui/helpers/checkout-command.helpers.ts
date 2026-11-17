/**
 * The pane's Copy checkout command, for an open PR whose repo has no clone
 * on this computer (Settings › Local clones): plain git, to paste into a
 * terminal in a clone of the repo, wherever it is - a worktree beside it for
 * the PR's branch, as Check out makes with git. It assumes the clone's
 * remote for the repo is `origin`, and names the worktree's folder after the
 * repo (the clone's folder's name isn't known here).
 *
 * @module helpers/checkout-command
 */

// A word as the shell reads it: as it is when plain, else in single quotes
// - also one starting with =, which zsh takes for a command's path.
export const shellQuote = (value: string) =>
  /^[A-Za-z0-9_./:@%+,-][A-Za-z0-9_./:@%+=,-]*$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;

// A branch's folder name: / as _, and nothing Windows refuses (as the
// server's folderNameFor).
const folderNameFor = (branch: string) => branch.replace(/[/\\]/g, '_').replace(/[<>:"|?*]/g, '_');

// A fork's PR: its branch isn't on the repo's remote (as the server's
// isForkPr - a branch named as the base is a fork's too).
export const isForkPr = ({ branch, targetBranch, crossRepository }: { branch?: string; targetBranch?: string; crossRepository?: boolean }) =>
  Boolean(crossRepository) || (Boolean(targetBranch) && branch === targetBranch);

export interface CheckoutCommandPr {
  repo: string;
  number: string | number;
  branch?: string;
  targetBranch?: string;
  crossRepository?: boolean;
}

/**
 * The commands, joined by && (so a shell that has it: bash, zsh, Git Bash -
 * not Windows PowerShell 5.1): the PR's branch fetched from origin into a
 * branch of the same name tracking it - a fork's pull ref into pr-<number>
 * tracking that, as gh pr checkout does - in a worktree at
 * ../<repo>-<branch>. As the server's plain git does it: the worktree from
 * FETCH_HEAD and the tracking set by git config, so a shallow or
 * single-branch clone (no origin/<branch> made by the fetch) works too. ""
 * when the PR's branch isn't known.
 */
export const checkoutCommandFor = (pr: CheckoutCommandPr) => {
  const repoName = pr.repo.split('/').pop() || pr.repo;
  const fork = isForkPr(pr);
  const name = fork ? `pr-${pr.number}` : String(pr.branch || '');
  if (!name) return '';
  const ref = fork ? `refs/pull/${pr.number}/head` : `refs/heads/${name}`;
  return [
    `git fetch origin ${shellQuote(ref)}`,
    `git worktree add -b ${shellQuote(name)} ${shellQuote(`../${repoName}-${folderNameFor(name)}`)} FETCH_HEAD`,
    `git config ${shellQuote(`branch.${name}.remote`)} origin`,
    `git config ${shellQuote(`branch.${name}.merge`)} ${shellQuote(ref)}`,
  ].join(' && ');
};
