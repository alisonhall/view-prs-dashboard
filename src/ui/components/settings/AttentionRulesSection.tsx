import { useFilterState } from '../../state/FilterStateContext';
import { useAuthorThreadResolutionSelection } from '../../state/AuthorThreadResolutionSelectionContext';
import { AttentionNoActivityModeSelect } from './AttentionNoActivityModeSelect';
import { AuthorThreadResolutionModeSelect } from './AuthorThreadResolutionModeSelect';
import { SettingsCheckField } from './SettingsCheckField';
import { SettingsListDropdown } from './SettingsListDropdown';
import { ATTENTION_CHECKBOX_FIELDS, THREAD_RESOLUTION_ALLOW_LIST, THREAD_RESOLUTION_DENY_LIST } from './settings-fields';

/**
 * The Settings drawer's "Attention rules" (UI_REDESIGN_PLAN.md, phase 9b):
 * which PRs count as needing attention (NO_ACTIVITY handling and five
 * toggles), and the PR author thread resolution policy, each saying what
 * it does. Its starters list shows for the mode that uses it - "allow
 * only" the allow list, "disallow for" the deny list - while the other
 * keeps its picks, hidden.
 */
export function AttentionRulesSection() {
  const { values } = useFilterState();
  const mode = values.attentionAuthorThreadResolutionMode;
  const selection = useAuthorThreadResolutionSelection();

  return (
    <div className="settings-section">
      <div className="settings-group">
        <h3 className="settings-heading">Needs Attention rules</h3>
        <p className="settings-hint">
          Which PRs get the warning icon and are in the Needs Attention group. An open PR needs attention when it&apos;s
          CHANGED - someone else did something since your own latest activity on it, or since you acked it - and, as
          the first rule says, when it&apos;s NO_ACTIVITY.
        </p>
        <div className="settings-field">
          <label htmlFor="attention-no-activity-mode">NO_ACTIVITY handling</label>
          <AttentionNoActivityModeSelect describedBy="attention-no-activity-mode-hint" />
          <p className="settings-hint" id="attention-no-activity-mode-hint">
            Which NO_ACTIVITY PRs - ones you&apos;ve had no activity on yet, and haven&apos;t acked - need attention.
          </p>
        </div>
        {ATTENTION_CHECKBOX_FIELDS.map((field) => (
          <SettingsCheckField key={field.id} field={field} />
        ))}
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Thread resolution</h3>
        <p className="settings-hint">
          Which conversations on their own PR its author may resolve, when someone else started them. One resolved against
          this is flagged in the Conversations tab; it doesn&apos;t make the PR need attention.
        </p>
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
