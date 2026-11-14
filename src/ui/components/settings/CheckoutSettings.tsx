import { useId, useState, type FormEvent } from 'react';
import { type LocalRepoStatus, type LocalRepoCheckout } from '../../state/LocalBranchesContext';
import { postJson, sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { Button } from '../ui/Button';

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
export const placeholdersInSingleQuotes = (command: string): string[] => {
  const found: string[] = [];
  let quote = '';
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote === "'") {
      if (char === "'") quote = '';
      else {
        const match = command.slice(index).match(PLACEHOLDER_PATTERN);
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

interface CommandCheck {
  command: string;
  name: string;
  found: boolean | null;
  detail: string;
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
      const commands = [command.trim(), after.trim()].filter(Boolean);
      const { response, result } = await postJson<{ ok?: boolean; error?: string; results?: CommandCheck[] }>(
        '/view-prs/local-repos/checkout/check',
        { repo, commands },
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
    const checkout = { command: command.trim(), forks: Boolean(command.trim()) && forks, after: after.trim(), folder: folder.trim(), env };
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
  return (
    <details className="local-clone-checkout">
      <summary>Check out PRs with {saved?.command ? <code>{saved.command}</code> : 'git'}</summary>
      <form className="settings-group" onSubmit={save}>
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
          Run in an interactive shell in the clone&apos;s folder, so your rc file&apos;s aliases and functions work. It has to leave a
          worktree of the clone with a branch tracking the PR&apos;s branch on the repo&apos;s remote (<code>{'{ref}'}</code> on{' '}
          <code>{'{remote}'}</code>).
        </p>
        <QuotedPlaceholders command={command} />
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
          Given to both commands. In a command, {PLACEHOLDER_NAMES} are the PR&apos;s, quoted for you, so leave them out of quotes of your own (<code>{'{local}'}</code> and{' '}
          <code>{'{worktree}'}</code> in the after-command); scripts get them as VIEW_PRS_ variables, with VIEW_PRS_IS_FORK and
          VIEW_PRS_HEAD_OID.
        </p>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        {checks && (
          <ul className="local-clone-checks" role="status" aria-label="What your shell knows">
            {checks.map((item) => (
              <li key={item.command} data-found={item.found === null ? 'unknown' : String(item.found)}>
                {item.found === true ? '✓' : item.found === false ? '✗' : '?'} <code>{item.name || item.command}</code>: {item.detail}
              </li>
            ))}
          </ul>
        )}
        <div className="local-clone-checkout-actions">
          <Button type="submit" disabled={busy} aria-label={`Save how to check out ${repo}'s PRs`}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            disabled={checking || (!command.trim() && !after.trim())}
            title="Whether your shell knows each command's first word, as Check out would run it"
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
const PLACEHOLDER_NAMES = (
  <>
    <code>{'{branch}'}</code>, <code>{'{number}'}</code>, <code>{'{repo}'}</code>, <code>{'{remote}'}</code>, <code>{'{ref}'}</code> and{' '}
    <code>{'{clone}'}</code>
  </>
);
