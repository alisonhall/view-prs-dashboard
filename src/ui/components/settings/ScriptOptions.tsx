import { useId } from 'react';
import { ContextRunScriptTextInput } from './ContextRunScriptTextInput';
import { KnownReposDatalist } from './KnownReposDatalist';
import { OpenModeSelect } from './OpenModeSelect';
import { SettingsCheckField } from './SettingsCheckField';
import { SCRIPT_CHECKBOX_FIELDS, SCRIPT_TEXT_FIELDS } from './settings-fields';

/**
 * Run & check's "Options for Run script": the rarely changed options it
 * passes check-open-pr-updates.sh (repo, limits, parallel jobs, open mode,
 * ack/reason/quiet), each with what it does under it. Saved when a run
 * starts (persistRunScriptOptions). The repo field is a picker: it
 * suggests the repos the page knows of (KnownReposDatalist), and takes any
 * other.
 */
export function ScriptOptions() {
  const knownReposListId = useId();
  return (
    <>
      {SCRIPT_TEXT_FIELDS.map((field) => (
        <div key={field.id} className="settings-field">
          <label htmlFor={field.id}>{field.label}</label>
          <ContextRunScriptTextInput
            id={field.id}
            name={field.name}
            type={field.type}
            placeholder={field.placeholder}
            filterStateKey={field.key}
            list={field.key === 'repo' ? knownReposListId : undefined}
            describedBy={field.hint ? `${field.id}-hint` : undefined}
          />
          {field.hint && (
            <p className="settings-hint" id={`${field.id}-hint`}>
              {field.hint}
            </p>
          )}
        </div>
      ))}
      <KnownReposDatalist id={knownReposListId} />
      <div className="settings-field">
        <label htmlFor="open-mode">Open mode</label>
        <OpenModeSelect describedBy="open-mode-hint" />
        <p className="settings-hint" id="open-mode-hint">
          Which PRs the run opens in a browser, on the computer the server runs on, once it finishes.
        </p>
      </div>
      {SCRIPT_CHECKBOX_FIELDS.map((field) => (
        <SettingsCheckField key={field.id} field={field} />
      ))}
    </>
  );
}
