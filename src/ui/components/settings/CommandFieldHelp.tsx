import { shellQuote } from '../../helpers/checkout-command.helpers.ts';

/**
 * What each of a repo's commands (Settings › Local clones › Check out PRs
 * with…) is given and has to do - when it runs, in which folder, what's
 * made of its output, what the dashboard does when it's empty, and which
 * placeholders it has - as the server runs them
 * (view-prs-local-checkout.js), and the command as it would run for an
 * example PR.
 */

export type CommandField = 'command' | 'after' | 'cleanupList' | 'cleanupRemove';

export type PlaceholderName = 'branch' | 'number' | 'repo' | 'remote' | 'ref' | 'clone' | 'local' | 'worktree';

export const PLACEHOLDER_NAMES: PlaceholderName[] = ['branch', 'number', 'repo', 'remote', 'ref', 'clone', 'local', 'worktree'];

// Each placeholder: the variable a script reads it as, and what it is.
const PLACEHOLDERS: Record<PlaceholderName, { variable: string; meaning: string }> = {
  branch: { variable: 'VIEW_PRS_BRANCH', meaning: "The PR's branch on GitHub (a fork's PR: the branch's name in the fork)" },
  number: { variable: 'VIEW_PRS_NUMBER', meaning: "The PR's number" },
  repo: { variable: 'VIEW_PRS_REPO', meaning: 'The repo, as owner/name' },
  remote: { variable: 'VIEW_PRS_REMOTE', meaning: "The clone's remote for the repo (origin, unless it has another)" },
  ref: { variable: 'VIEW_PRS_REF', meaning: "The ref to fetch from {remote}: refs/heads/<branch>, or a fork's PR's refs/pull/<number>/head" },
  clone: { variable: 'VIEW_PRS_CLONE', meaning: "The clone's folder, a full path with / slashes" },
  local: { variable: 'VIEW_PRS_LOCAL_BRANCH', meaning: 'The local branch: the one git just made (pr-<number> for a fork) or the worktree’s' },
  worktree: { variable: 'VIEW_PRS_WORKTREE', meaning: "The worktree's folder, a full path with / slashes" },
};

interface FieldDoc {
  runs: string;
  folder: string;
  must: string;
  output: string;
  empty: string;
  placeholders: PlaceholderName[];
  // Variables only scripts get (no placeholder).
  extraVariables?: string;
  example: string;
  // Why Check commands doesn't run it - or "" when it does.
  notRun: string;
}

export const FIELD_LABELS: Record<CommandField, string> = {
  command: 'Checkout command',
  after: 'After git makes a worktree, run',
  cleanupList: 'Clean up: list command',
  cleanupRemove: 'Clean up: remove command',
};

export const FIELD_DOCS: Record<CommandField, FieldDoc> = {
  command: {
    runs: "When you press Check out on a PR the clone has no local branch for (and a fork's PR only if the box below is ticked).",
    folder: "The clone's folder.",
    must:
      'Exit 0, leaving a worktree of the clone whose branch tracks {ref} on {remote} (branch.<name>.remote and branch.<name>.merge set, as git worktree add --track or git branch -u does). Afterwards the dashboard looks for that worktree, and says so if there isn’t one.',
    output: "Not read: it's shown under Check out. When the command fails, its last line (or its first fatal:/error: line) is given as the reason.",
    empty:
      'git fetch {remote} {ref}, then git worktree add -b {branch} <Folder for git’s worktrees> FETCH_HEAD, then git config branch.{branch}.remote {remote} and branch.{branch}.merge {ref}.',
    placeholders: ['branch', 'number', 'repo', 'remote', 'ref', 'clone'],
    extraVariables: 'VIEW_PRS_IS_FORK (1 for a fork’s PR, else empty) and VIEW_PRS_HEAD_OID (the PR’s newest commit, as last fetched)',
    example: 'git fetch {remote} {ref} && git worktree add --track -b {branch} ../pr-{number} {remote}/{branch}',
    notRun: 'Not run here: it would make a worktree. Only its first word is checked.',
  },
  after: {
    runs: 'After git (not your checkout command) makes a worktree for Check out.',
    folder: 'The new worktree.',
    must: 'Exit 0. If it fails the worktree stays, and Check out says why.',
    output: 'Not read: shown under Check out.',
    empty: 'Nothing runs.',
    placeholders: ['branch', 'number', 'repo', 'remote', 'ref', 'clone', 'local', 'worktree'],
    extraVariables: 'VIEW_PRS_IS_FORK and VIEW_PRS_HEAD_OID',
    example: 'npm ci',
    notRun: 'Not run here: it runs in a new worktree, once git has made one. Only its first word is checked.',
  },
  cleanupList: {
    runs: 'When you press Look in Clean up, and when you press Check commands here.',
    folder: "The clone's folder.",
    must: 'Print the worktree folders it would remove and exit 0, without changing anything.',
    output:
      'Each line of stdout is a worktree folder, a full path (as git worktree list prints it). A line that isn’t a worktree of this clone is ignored, and Clean up lists it as such. stderr is shown as a note. The dashboard’s own checks still apply to every worktree listed: no open PR, no uncommitted changes, nothing not on GitHub.',
    empty: 'git: the local branches of the page’s merged and closed PRs, each with its worktree.',
    placeholders: ['clone', 'repo'],
    example: "git worktree list --porcelain | sed -n 's/^worktree //p'",
    notRun: '',
  },
  cleanupRemove: {
    runs: 'When you press Remove on a worktree in Clean up, and say yes.',
    folder: "The clone's folder.",
    must:
      'Remove the worktree at {worktree} without asking anything (there’s no input to answer with), and exit 0. Afterwards the dashboard checks it’s no longer a worktree. The branch is left alone unless your command deletes it too.',
    output: 'Not read: shown in Clean up.',
    empty: 'git worktree remove {worktree} (never forced: git refuses one with changes), then the branch {local} is deleted.',
    placeholders: ['clone', 'repo', 'worktree', 'local'],
    example: 'git worktree remove {worktree} && git branch -D {local}',
    notRun: 'Not run here: it would remove a worktree. Only its first word is checked.',
  },
};

// The example PR the previews use.
const EXAMPLE_BRANCH = 'feature/login';
const EXAMPLE_NUMBER = '42';

// A folder as path.resolve would make it: a relative one from the clone's.
const resolveFolder = (base: string, relative: string) => {
  const target = relative.replace(/\\/g, '/');
  if (/^([A-Za-z]:)?\//.test(target) || target.startsWith('~')) return target;
  const parts = base.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  target.split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') parts.pop();
    else parts.push(part);
  });
  return parts.join('/');
};

// The example PR's values, for repo's clone at clonePath.
export const exampleValues = (repo: string, clonePath: string, folderPattern: string): Record<PlaceholderName, string> => {
  const clone = (clonePath || '/path/to/clone').replace(/\\/g, '/').replace(/\/+$/, '');
  const cloneName = clone.split('/').pop() || 'clone';
  const worktree = resolveFolder(
    clone,
    (folderPattern || '../{clone}-{branch}').replace(/\{branch\}/g, EXAMPLE_BRANCH.replace(/\//g, '_')).replace(/\{clone\}/g, cloneName),
  );
  return {
    branch: EXAMPLE_BRANCH,
    number: EXAMPLE_NUMBER,
    repo: repo || 'owner/name',
    remote: 'origin',
    ref: `refs/heads/${EXAMPLE_BRANCH}`,
    clone,
    local: EXAMPLE_BRANCH,
    worktree,
  };
};

// The command with each placeholder as the example's value, quoted as the
// shell gets it; one the field isn't given is empty, as it would be.
export const previewCommand = (command: string, field: CommandField, values: Record<PlaceholderName, string>) => {
  const given = FIELD_DOCS[field].placeholders;
  return command.replace(/\{([a-z]+)\}/g, (whole, name: string) => {
    if (!(PLACEHOLDER_NAMES as string[]).includes(name)) return whole;
    return given.includes(name as PlaceholderName) ? shellQuote(values[name as PlaceholderName]) : "''";
  });
};

// The placeholders a command uses that its field isn't given.
export const placeholdersNotGiven = (command: string, field: CommandField) => {
  const given = FIELD_DOCS[field].placeholders;
  const used = Array.from(command.matchAll(/\{([a-z]+)\}/g), (match) => match[1] as string);
  return Array.from(new Set(used.filter((name) => (PLACEHOLDER_NAMES as string[]).includes(name) && !given.includes(name as PlaceholderName))));
};

/**
 * Under a command's field: what it's run with as the example PR, a warning
 * for placeholders it isn't given, and (folded) what it's given and has to do.
 */
export function CommandFieldHelp({ field, command, values }: { field: CommandField; command: string; values: Record<PlaceholderName, string> }) {
  const doc = FIELD_DOCS[field];
  const trimmed = command.trim();
  const missing = trimmed ? placeholdersNotGiven(trimmed, field) : [];
  return (
    <>
      {trimmed && (
        <p className="settings-hint local-clone-command-preview">
          {field === 'cleanupList' ? (
            'Runs as: '
          ) : field === 'cleanupRemove' ? (
            <>
              For the worktree <code>{values.worktree}</code>, runs:{' '}
            </>
          ) : (
            <>
              For PR #{values.number} from <code>{values.branch}</code>, runs:{' '}
            </>
          )}
          <code>{previewCommand(trimmed, field, values)}</code>
        </p>
      )}
      {missing.length > 0 && (
        <p className="settings-hint" data-tone="warning">
          {missing.map((name) => `{${name}}`).join(', ')} {missing.length === 1 ? "isn't" : "aren't"} given to this command, so{' '}
          {missing.length === 1 ? "it's" : "they're"} empty. It has {doc.placeholders.map((name) => `{${name}}`).join(', ')}.
        </p>
      )}
      <details className="local-clone-command-help">
        <summary>What it&apos;s given and has to do</summary>
        <dl>
          <dt>Runs</dt>
          <dd>{doc.runs}</dd>
          <dt>In</dt>
          <dd>{doc.folder}</dd>
          <dt>Has to</dt>
          <dd>{doc.must}</dd>
          <dt>Its output</dt>
          <dd>{doc.output}</dd>
          <dt>When empty</dt>
          <dd>{doc.empty}</dd>
          <dt>Example</dt>
          <dd>
            <code>{doc.example}</code>
          </dd>
        </dl>
        <table className="local-clone-placeholders">
          <caption>Placeholders it has</caption>
          <thead>
            <tr>
              <th scope="col">Placeholder</th>
              <th scope="col">Script variable</th>
              <th scope="col">What it is</th>
              <th scope="col">For the example PR</th>
            </tr>
          </thead>
          <tbody>
            {doc.placeholders.map((name) => (
              <tr key={name}>
                <td>
                  <code>{`{${name}}`}</code>
                </td>
                <td>
                  <code>{PLACEHOLDERS[name].variable}</code>
                </td>
                <td>{PLACEHOLDERS[name].meaning}</td>
                <td>
                  <code>{values[name]}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {doc.extraVariables && <p className="settings-hint">Scripts also get {doc.extraVariables}.</p>}
      </details>
    </>
  );
}
