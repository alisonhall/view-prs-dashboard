import { ContextFilterCheckbox } from './ContextFilterCheckbox';
import { ContextRunScriptTextInput } from './ContextRunScriptTextInput';
import { OpenModeSelect } from './OpenModeSelect';
import { SCRIPT_CHECKBOX_FIELDS, SCRIPT_TEXT_FIELDS } from './settings-fields';

/**
 * The Settings drawer's "Script options" (UI_REDESIGN_PLAN.md, phase 9b):
 * the rarely changed options "Run script" passes check-open-pr-updates.sh
 * (repo, limits, parallel jobs, open mode, ack/reason/quiet). Saved when a
 * run starts (persistRunScriptOptions).
 */
export function ScriptOptionsSection() {
  return (
    <div className="settings-section">
      <div className="settings-group">
        {SCRIPT_TEXT_FIELDS.map((field) => (
          <div key={field.id} className="settings-field">
            <label htmlFor={field.id}>{field.label}</label>
            <ContextRunScriptTextInput id={field.id} name={field.name} type={field.type} placeholder={field.placeholder} filterStateKey={field.key} />
          </div>
        ))}
        <div className="settings-field">
          <label htmlFor="open-mode">Open mode</label>
          <OpenModeSelect />
        </div>
        {SCRIPT_CHECKBOX_FIELDS.map((field) => (
          <label key={field.id} className="settings-check">
            <ContextFilterCheckbox id={field.id} name={field.name} filterStateKey={field.key} />
            {field.label}
          </label>
        ))}
      </div>
    </div>
  );
}
