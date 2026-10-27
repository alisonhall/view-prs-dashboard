import { useFilterState } from '../../state/FilterStateContext';
import { useAuthorThreadResolutionSelection } from '../../state/AuthorThreadResolutionSelectionContext';
import { AttentionNoActivityModeSelect } from './AttentionNoActivityModeSelect';
import { AuthorThreadResolutionModeSelect } from './AuthorThreadResolutionModeSelect';
import { ContextFilterCheckbox } from './ContextFilterCheckbox';
import { SettingsListDropdown } from './SettingsListDropdown';
import { ATTENTION_CHECKBOX_FIELDS, THREAD_RESOLUTION_ALLOW_LIST, THREAD_RESOLUTION_DENY_LIST } from './settings-fields';

/**
 * The Settings drawer's "Attention rules" (UI_REDESIGN_PLAN.md, phase 9b):
 * which PRs count as needing attention (NO_ACTIVITY handling and five
 * toggles), and the PR author thread resolution policy. Its starters list
 * shows for the mode that uses it - "allow only" the allow list, "disallow
 * for" the deny list - while the other keeps its picks, hidden.
 */
export function AttentionRulesSection() {
  const { values } = useFilterState();
  const mode = values.attentionAuthorThreadResolutionMode;
  const selection = useAuthorThreadResolutionSelection();

  return (
    <div className="settings-section">
      <div className="settings-group">
        <h3 className="settings-heading">Needs Attention rules</h3>
        <div className="settings-field">
          <label htmlFor="attention-no-activity-mode">NO_ACTIVITY handling</label>
          <AttentionNoActivityModeSelect />
        </div>
        {ATTENTION_CHECKBOX_FIELDS.map((field) => (
          <label key={field.id} className="settings-check">
            <ContextFilterCheckbox id={field.id} name={field.name} filterStateKey={field.key} />
            {field.label}
          </label>
        ))}
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Thread resolution</h3>
        <div className="settings-field">
          <label htmlFor="attention-author-thread-resolution-mode">PR author thread resolution policy</label>
          <AuthorThreadResolutionModeSelect />
        </div>
        <div className="settings-field" id="attention-author-thread-resolution-allow-options" hidden={mode !== 'allow-only'}>
          <SettingsListDropdown list={THREAD_RESOLUTION_ALLOW_LIST} selection={selection} />
        </div>
        <div className="settings-field" id="attention-author-thread-resolution-deny-options" hidden={mode !== 'deny-only'}>
          <SettingsListDropdown list={THREAD_RESOLUTION_DENY_LIST} selection={selection} />
        </div>
      </div>
    </div>
  );
}
