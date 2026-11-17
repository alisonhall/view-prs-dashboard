import { ContextFilterCheckbox } from './ContextFilterCheckbox';
import type { SettingsCheckboxField } from './settings-fields';

/**
 * One of settings-fields' checkboxes, labelled, with its hint under it as
 * its description (Attention rules, Run & check's options for Run script).
 */
export function SettingsCheckField({ field }: { field: SettingsCheckboxField }) {
  const hintId = field.hint ? `${field.id}-hint` : undefined;
  return (
    <div className="settings-check-field">
      <label className="settings-check">
        <ContextFilterCheckbox id={field.id} name={field.name} filterStateKey={field.key} describedBy={hintId} />
        {field.label}
      </label>
      {field.hint && (
        <p className="settings-hint" id={hintId}>
          {field.hint}
        </p>
      )}
    </div>
  );
}
