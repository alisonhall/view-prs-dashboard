import { useId, useState, type FormEvent } from 'react';
import { type OpenWithSettings as OpenWith } from '../../state/LocalBranchesContext';
import { postJson, sendJson } from '../../helpers/pr-http.helpers.ts';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';
import { Button } from '../ui/Button';
import { placeholdersInSingleQuotes } from './CheckoutSettings';

const FOLDER_PATTERN = /^\{folder\}/;

// {folder} inside the command's own single quotes: taken as written, not as
// the folder.
function QuotedFolder({ command }: { command: string }) {
  if (placeholdersInSingleQuotes(command, FOLDER_PATTERN).length === 0) return null;
  return (
    <p className="settings-hint" data-tone="warning">
      {'{folder}'} inside single quotes is taken as written, not as the folder - take it out of the quotes.
    </p>
  );
}

interface CommandCheck {
  command: string;
  name: string;
  found: boolean | null;
  detail: string;
}

// The terminal opened without a command of the user's, by the server's
// platform.
export const defaultTerminalName = (platform: string) =>
  platform === 'win32' ? 'Windows Terminal, else a Command Prompt' : platform === 'darwin' ? 'Terminal' : 'x-terminal-emulator';

/**
 * This computer's editor and terminal for the pane's Open in editor and
 * Terminal - one for every repo, run as Check out's commands are (the
 * user's interactive shell, Git Bash on Windows, in the folder), given the
 * folder as {folder}, added at the end when not named. Empty: VS Code's
 * `code`, and the system's terminal.
 */
export function OpenWithSettings({
  initial,
  platform,
  onSaved,
}: {
  initial: OpenWith;
  // The server's (process.platform).
  platform: string;
  onSaved: (openWith: OpenWith) => void;
}) {
  const id = useId();
  const [saved, setSaved] = useState<OpenWith>(initial);
  const [editor, setEditor] = useState(initial.editor || '');
  const [terminal, setTerminal] = useState(initial.terminal || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<CommandCheck[] | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { response, result } = await sendJson<{ ok?: boolean; error?: string; openWith?: OpenWith }>('PUT', '/view-prs/local-repos/open-with', {
        openWith: { editor: editor.trim(), terminal: terminal.trim() },
      });
      if (!response.ok || result.ok === false) {
        setError(result.error || `HTTP ${response.status}`);
        return;
      }
      const next = result.openWith || {};
      setSaved(next);
      onSaved(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  // Whether the user's shell knows each command, as it would run it (in
  // the home folder: no repo's).
  const check = async () => {
    setChecking(true);
    setChecks(null);
    setError('');
    try {
      const { response, result } = await postJson<{ ok?: boolean; error?: string; results?: CommandCheck[] }>(
        '/view-prs/local-repos/checkout/check',
        { repo: '', commands: [editor.trim(), terminal.trim()].filter(Boolean) },
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

  return (
    <details className="local-clone-checkout local-open-with">
      <summary>
        Open worktrees with {saved.editor ? <code>{saved.editor}</code> : 'VS Code'} and{' '}
        {saved.terminal ? <code>{saved.terminal}</code> : `the system's terminal`}
      </summary>
      <form className="settings-group" onSubmit={save}>
        <label htmlFor={`${id}-editor`}>Editor command</label>
        <input
          id={`${id}-editor`}
          type="text"
          placeholder="Empty for VS Code (code), or like cursor, subl, zed or idea"
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={editor}
          onChange={(event) => setEditor(event.target.value)}
        />
        <QuotedFolder command={editor} />
        <label htmlFor={`${id}-terminal`}>Terminal command</label>
        <input
          id={`${id}-terminal`}
          type="text"
          placeholder={`Empty for ${defaultTerminalName(platform)}, or like wezterm start --cwd {folder}`}
          {...NON_CREDENTIAL_INPUT_PROPS}
          value={terminal}
          onChange={(event) => setTerminal(event.target.value)}
        />
        <QuotedFolder command={terminal} />
        <p className="settings-hint">
          For the PR details&apos; Open in editor and Terminal, every repo&apos;s. Each runs as the checkout commands do, in an interactive
          shell{platform === 'win32' ? ' (Git Bash)' : ''} in the folder, so your aliases and functions work. <code>{'{folder}'}</code> is
          the folder, quoted for you - added at the end when the command doesn&apos;t have it. It should start the editor or terminal and
          return.{platform === 'darwin' ? ' An app without a command: open -a iTerm {folder}.' : ''}
        </p>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        {checks && (
          <div role="status">
            <ul className="local-clone-checks" aria-label="What your shell knows">
              {checks.map((item) => (
                <li key={item.command} data-found={item.found === null ? 'unknown' : String(item.found)}>
                  {item.found === true ? '✓' : item.found === false ? '✗' : '?'} <code>{item.name || item.command}</code>: {item.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="local-clone-checkout-actions">
          <Button type="submit" disabled={busy} aria-label="Save the editor and terminal commands">
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            disabled={checking || !(editor.trim() || terminal.trim())}
            aria-label="Check the editor and terminal commands"
            title="Whether your shell knows each command's first word"
            onClick={() => void check()}
          >
            {checking ? 'Checking…' : 'Check commands'}
          </Button>
        </div>
      </form>
    </details>
  );
}
