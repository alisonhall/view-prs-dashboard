import { useId, useState, type FormEvent } from 'react';
import { type LocalRepoStatus, type LocalRepoCheckout } from '../../state/LocalBranchesContext';
import { postJson, sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { Button } from '../ui/Button';
import { CommandFieldHelp, FIELD_DOCS, FIELD_LABELS, exampleValues, type CommandField } from './CommandFieldHelp';

interface LocalReposResult {
  ok?: boolean;
  error?: string;
  repos?: Record<string, LocalRepoStatus>;
}

// "NAME=value" lines - as written in a shell (export, quotes) too - and
// the lines that aren't one.
const parseVariables = (text: string) => {
  const env: Record<string, string> = {};
  const invalid: string[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      invalid.push(trimmed);
      return;
    }
    env[match[1] || ''] = (match[2] || '').trim().replace(/^(["'])(.*)\1$/, '$2');
  });
  return { env, invalid };
};

const PLACEHOLDER_PATTERN = /^\{(branch|number|repo|remote|ref|clone|local|worktree)\}/;

// The placeholders inside the command's own single quotes, where the shell
// takes them as written, not as the PR's values ("{branch}" as the text
// "$VIEW_PRS_BRANCH").
export const placeholdersInSingleQuotes = (command: string, pattern: RegExp = PLACEHOLDER_PATTERN): string[] => {
  const found: string[] = [];
  let quote = '';
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote === "'") {
      if (char === "'") quote = '';
      else {
        const match = command.slice(index).match(pattern);
        if (match) found.push(match[0]);
      }
    } else if (char === '\\') {
      index += 1;
    } else if (quote === '"') {
      if (char === '"') quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
    }
  }
  return Array.from(new Set(found));
};

// The list command's run by Check commands.
interface CommandTrial {
  exitCode?: number | null;
  timedOut?: boolean;
  lines?: Array<{ text: string; worktree: boolean }>;
  stderr?: string;
  error?: string;
}

interface CommandCheck {
  command: string;
  field?: CommandField;
  name: string;
  found: boolean | null;
  detail: string;
  trial?: CommandTrial;
}

const variablesToText = (env: Record<string, string> | undefined) =>
  Object.entries(env || {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');

/**
 * How the pane's Check out makes a worktree for a repo's PRs: plain git, or
 * the user's own command - nothing assumed about what it is, only what it
 * has to leave behind - with a command to run after git makes one, where
 * git puts them, and variables for the commands. Each repo its own; Copy
 * from fills them in from another repo's.
 */
export function CheckoutSettings({
  repo,
  status,
  others,
  onSaved,
}: {
  repo: string;
  status: LocalRepoStatus;
  // The other repos' checkout settings, to copy from.
  others: Record<string, LocalRepoCheckout>;
  onSaved: (repos: Record<string, LocalRepoStatus>) => void;
}) {
  const id = useId();
  const saved = status.checkout;
  const [command, setCommand] = useState(saved?.command || '');
  const [forks, setForks] = useState(saved?.forks === true);
  const [after, setAfter] = useState(saved?.after || '');
  const [folder, setFolder] = useState(saved?.folder || '');
  const [cleanupList, setCleanupList] = useState(saved?.cleanupList || '');
  const [cleanupRemove, setCleanupRemove] = useState(saved?.cleanupRemove || '');
  const [variables, setVariables] = useState(variablesToText(saved?.env));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<CommandCheck[] | null>(null);

  // Whether the user's shell knows each command, as Check out would run it.
  const check = async () => {
    setChecking(true);
    setChecks(null);
    setError('');
    try {
      const commands = (
        [
          ['command', command],
          ['after', after],
          ['cleanupList', cleanupList],
          ['cleanupRemove', cleanupRemove],
        ] as Array<[CommandField, string]>
      )
        .map(([field, value]) => ({ field, command: value.trim() }))
        .filter((item) => item.command);
      // The variables as typed - the list command runs with them.
      const { env } = parseVariables(variables);
      const { response, result } = await postJson<{ ok?: boolean; error?: string; results?: CommandCheck[] }>(
        '/view-prs/local-repos/checkout/check',
        { repo, commands, env },
      );
      if (!response.ok || result.ok === false) {
        setError(result.error || `HTTP ${response.status}`);
        return;
      }
      setChecks(result.results || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setChecking(false);
    }
  };

  const fillFrom = (checkout: LocalRepoCheckout | undefined) => {
    setCommand(checkout?.command || '');
    setForks(checkout?.forks === true);
    setAfter(checkout?.after || '');
    setFolder(checkout?.folder || '');
    setCleanupList(checkout?.cleanupList || '');
    setCleanupRemove(checkout?.cleanupRemove || '');
    setVariables(variablesToText(checkout?.env));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const { env, invalid } = parseVariables(variables);
    if (invalid.length > 0) {
      setError(`Not NAME=value: ${invalid.join(', ')}`);
      return;
    }
    const checkout = {
      command: command.trim(),
      forks: Boolean(command.trim()) && forks,
      after: after.trim(),
      folder: folder.trim(),
      env,
      cleanupList: cleanupList.trim(),
      cleanupRemove: cleanupRemove.trim(),
    };
    setBusy(true);
    try {
      const { response, result } = await sendJson<LocalReposResult>('PUT', '/view-prs/local-repos/checkout', { repo, checkout });
      if (!response.ok || result.ok === false) {
        setError(result.error || `HTTP ${response.status}`);
        return;
      }
      if (result.repos) onSaved(result.repos);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const otherRepos = Object.keys(others).sort();
  const values = exampleValues(repo, status.path || '', folder.trim());
  return (
    <details className="local-clone-checkout">
      <summary>Check out PRs with {saved?.command ? <code>{saved.command}</code> : 'git'}</summary>
      <form className="settings-group" onSubmit={save}>
        <p className="settings-hint">
          Leave a command empty to use the dashboard&apos;s own git steps. A command runs in your interactive shell (bash
          or zsh, from <code>$SHELL</code>; Git Bash on Windows), so your rc file&apos;s aliases and functions work, with no input
          (anything that asks a question fails) and up to 3 minutes. Write a placeholder like <code>{'{branch}'}</code> as it is,
          outside quotes of your own: it&apos;s replaced by the PR&apos;s value, already quoted. Scripts get the same values as{' '}
          <code>VIEW_PRS_</code> variables. What your shell prints as it starts, or as it changes folder (an rc file&apos;s greeting,
          nvm&apos;s &quot;Now using node&quot;), is left out of a command&apos;s output.
        </p>
        {otherRepos.length > 0 && (
          <>
            <label htmlFor={`${id}-copy`}>Copy from</label>
            <select
              id={`${id}-copy`}
              value=""
              onChange={(event) => {
                if (event.target.value) fillFrom(others[event.target.value]);
              }}
            >
              <option value="">Another repo's settings…</option>
              {otherRepos.map((other) => (
                <option key={other} value={other}>
                  {other}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${id}-command`}>Checkout command</label>
        <input
          id={`${id}-command`}
          type="text"
          placeholder="Empty for git, or your own, like my-checkout {branch}"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
        />
        <p className="settings-hint">
          Makes the PR&apos;s worktree: it has to leave a worktree of the clone with a branch tracking <code>{'{ref}'}</code> on{' '}
          <code>{'{remote}'}</code>, and exit 0.
        </p>
        <QuotedPlaceholders command={command} />
        <CommandFieldHelp field="command" command={command} values={values} />
        <label className="settings-check">
          <input type="checkbox" checked={forks} disabled={!command.trim()} onChange={(event) => setForks(event.target.checked)} />
          Use it for forks&apos; PRs too (their pull ref, <code>refs/pull/&lt;number&gt;/head</code>) - else git makes those
        </label>
        <label htmlFor={`${id}-after`}>After git makes a worktree, run</label>
        <input
          id={`${id}-after`}
          type="text"
          placeholder="Optional, like npm ci"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={after}
          onChange={(event) => setAfter(event.target.value)}
        />
        <p className="settings-hint">In the new worktree. If it fails, the worktree stays and you&apos;re told why.</p>
        <QuotedPlaceholders command={after} />
        <CommandFieldHelp field="after" command={after} values={values} />
        <label htmlFor={`${id}-folder`}>Folder for git&apos;s worktrees</label>
        <input
          id={`${id}-folder`}
          type="text"
          placeholder={DEFAULT_WORKTREE_FOLDER}
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
        />
        <p className="settings-hint">
          Relative to the clone&apos;s folder, or a full path (<code>~</code> is your home folder), but not inside the clone.{' '}
          <code>{'{branch}'}</code> is the branch&apos;s name with / as _, <code>{'{clone}'}</code> the clone folder&apos;s name.
        </p>
        <label htmlFor={`${id}-cleanup-list`}>Clean up: list command</label>
        <input
          id={`${id}-cleanup-list`}
          type="text"
          placeholder="Empty for git's checks, or your own, like my-clean --porcelain"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={cleanupList}
          onChange={(event) => setCleanupList(event.target.value)}
        />
        <p className="settings-hint">
          Prints the worktree folders it would remove, one full path a line on stdout and nothing else, and exits 0. It mustn&apos;t
          change anything: Check commands runs it.
        </p>
        <QuotedPlaceholders command={cleanupList} />
        <CommandFieldHelp field="cleanupList" command={cleanupList} values={values} />
        <label htmlFor={`${id}-cleanup-remove`}>Clean up: remove command</label>
        <input
          id={`${id}-cleanup-remove`}
          type="text"
          placeholder="Empty for git worktree remove, or your own, like my-rm {worktree} --yes"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={cleanupRemove}
          onChange={(event) => setCleanupRemove(event.target.value)}
        />
        <p className="settings-hint">
          Removes one worktree, <code>{'{worktree}'}</code>, without asking anything, and exits 0. Its branch, <code>{'{local}'}</code>,
          stays unless the command deletes it too.
        </p>
        <QuotedPlaceholders command={cleanupRemove} />
        <CommandFieldHelp field="cleanupRemove" command={cleanupRemove} values={values} />
        <label htmlFor={`${id}-variables`}>Variables</label>
        <textarea
          id={`${id}-variables`}
          rows={3}
          placeholder={'Optional, one NAME=value a line'}
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={variables}
          onChange={(event) => setVariables(event.target.value)}
        />
        <p className="settings-hint">
          Environment variables for all four commands, like <code>NODE_ENV=development</code>. Use them in a command as{' '}
          <code>$NAME</code>. Names starting VIEW_PRS_ are the dashboard&apos;s own.
        </p>
        <details className="local-clone-command-help">
          <summary>How variables work</summary>
          <dl>
            <dt>Format</dt>
            <dd>
              One <code>NAME=value</code> a line. A name is letters, digits and _, not starting with a digit. Blank lines and lines
              starting with <code>#</code> are skipped, and a leading <code>export</code> is allowed, so you can paste lines from a
              shell file.
            </dd>
            <dt>Values</dt>
            <dd>
              Taken as written, on one line: <code>$OTHER</code>, <code>~</code> and <code>$(…)</code> aren&apos;t expanded here. One
              pair of quotes around the whole value is dropped (<code>NAME=&quot;a b&quot;</code> is <code>a b</code>). To build one
              from another, do it in the command: <code>{'MY_DIR="$HOME/trees" my-checkout {branch}'}</code>.
            </dd>
            <dt>Given to</dt>
            <dd>
              The checkout, after, list and remove commands of this repo only (Copy from copies them to another), and
              Check commands&apos; run of the list command. Not to the editor and terminal commands.
            </dd>
            <dt>Order</dt>
            <dd>
              They&apos;re set before your shell starts, on top of the dashboard server&apos;s own environment, so a variable your rc
              file sets wins over one here. The VIEW_PRS_ values always win.
            </dd>
            <dt>Kept</dt>
            <dd>
              In plain text, with the clone&apos;s folder, on this computer only (local-repos.json): don&apos;t put tokens or passwords
              here.
            </dd>
            <dt>Example</dt>
            <dd>
              <code>NODE_ENV=development</code> for an after-command of <code>npm ci</code>, or <code>WORKTREES=D:/trees</code> for a
              checkout command of <code>{'git fetch {remote} {ref} && git worktree add --track -b {branch} "$WORKTREES"/{number} {remote}/{branch}'}</code>.
            </dd>
          </dl>
        </details>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        {checks && (
          <ul className="local-clone-checks" role="status" aria-label="What your shell knows">
            {checks.map((item) => (
              <CheckResult key={`${item.field || ''}\n${item.command}`} item={item} />
            ))}
          </ul>
        )}
        <div className="local-clone-checkout-actions">
          <Button type="submit" disabled={busy} aria-label={`Save how to check out ${repo}'s PRs`}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            disabled={checking || ![command, after, cleanupList, cleanupRemove].some((item) => item.trim())}
            title="Whether your shell knows each command, as Check out would run it - and the list command's run for real, as it only lists"
            onClick={() => void check()}
          >
            {checking ? 'Checking…' : 'Check commands'}
          </Button>
        </div>
      </form>
    </details>
  );
}

// A warning for placeholders in the command's own single quotes.
function QuotedPlaceholders({ command }: { command: string }) {
  const quoted = placeholdersInSingleQuotes(command);
  if (quoted.length === 0) return null;
  return (
    <p className="settings-hint" data-tone="warning">
      {quoted.join(', ')} inside single quotes {quoted.length === 1 ? 'is' : 'are'} taken as written, not as the PR&apos;s value - take{' '}
      {quoted.length === 1 ? 'it' : 'them'} out of the quotes.
    </p>
  );
}

const DEFAULT_WORKTREE_FOLDER = '../{clone}-{branch}';

// "exited 0", "took too long".
const describeExit = (trial: CommandTrial) =>
  trial.timedOut ? 'took too long' : typeof trial.exitCode === 'number' ? `exited ${trial.exitCode}` : "couldn't run";

// One command's answer: which field, whether the shell knows it, and - the
// list command - what it printed when run, each line a worktree or not.
function CheckResult({ item }: { item: CommandCheck }) {
  const trial = item.trial;
  const lines = trial?.lines || [];
  const trialOk = trial && !trial.error && trial.exitCode === 0 && lines.every((line) => line.worktree);
  const found = item.found === false || (trial && !trialOk) ? 'false' : item.found === null ? 'unknown' : 'true';
  return (
    <li data-found={found}>
      {item.field && <strong>{FIELD_LABELS[item.field]}: </strong>}
      {item.found === true ? '✓' : item.found === false ? '✗' : '?'} <code>{item.name || item.command}</code>: {item.detail}
      {item.field && FIELD_DOCS[item.field].notRun && <div className="settings-hint">{FIELD_DOCS[item.field].notRun}</div>}
      {trial?.error && <div className="settings-hint">Not run: {trial.error}</div>}
      {trial && !trial.error && (
        <div className="local-clone-check-trial">
          {trialOk ? '✓' : '✗'} Ran it in the clone: {describeExit(trial)}
          {trial.exitCode === 0
            ? lines.length === 0
              ? ', and printed no folders - nothing to clean up.'
              : `, and printed ${lines.length} line${lines.length === 1 ? '' : 's'}:`
            : ' - Clean up would fail with this.'}
          {lines.length > 0 && (
            <ul aria-label="What the list command printed">
              {lines.map((line) => (
                <li key={line.text} data-found={String(line.worktree)}>
                  {line.worktree ? '✓' : '✗'} <code>{line.text}</code>{' '}
                  {line.worktree ? '- a worktree of the clone' : "- not a worktree of this clone, so it's ignored"}
                </li>
              ))}
            </ul>
          )}
          {trial.stderr && (
            <pre className="local-clone-cleanup-output" aria-label="What the list command printed to stderr">
              {trial.stderr}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
