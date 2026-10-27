import { Button } from '../ui/Button';
import { useFilterState } from '../../state/FilterStateContext';
import { useOutputText } from '../../state/OutputTextContext';
import { useRepoLabels } from '../../state/RepoLabelsContext';
import { useStatusText } from '../../state/StatusTextContext';
import { useAckLabelActions } from '../../state/useAckLabelActions';
import { useQuickCheckActions } from '../../state/useQuickCheckActions';
import { useRunScript } from '../../state/useRunScript';
import { useTriggerAutoRun } from '../../state/useTriggerAutoRun';
import { ApplyLabelSelect } from './ApplyLabelSelect';
import { ContextRunScriptTextInput } from './ContextRunScriptTextInput';
import { QuickCheckButton } from './QuickCheckButton';
import { TriggerAutoRunButton } from './TriggerAutoRunButton';
import { PR_NUMBERS_FIELD } from './settings-fields';

/**
 * The Settings drawer's "Run & check" (UI_REDESIGN_PLAN.md, phase 9b):
 * - the latest status message, and "Trigger auto run" (the old Activity
 *   tab's);
 * - the PR numbers to run on, with Run script, Quick check and Apply ack
 *   only / clear only;
 * - a label to apply to them, with the repo's labels reloadable;
 * - the latest request's output, collapsed.
 *
 * #status and #output keep their ids: PrDataProvider's last-resort viewer
 * login reads the script's "Viewer: <login>" line from them.
 */
export function RunCheckSection() {
  const { statusText } = useStatusText();
  const { outputText } = useOutputText();
  const { persistRunScriptOptions } = useFilterState();
  const runScript = useRunScript();
  const triggerAutoRun = useTriggerAutoRun();
  const { handleQuickCheck } = useQuickCheckActions();
  const { handleAckOnly, handleClearOnly, handleApplyLabelClick } = useAckLabelActions();
  const { refresh: refreshLabels } = useRepoLabels();

  return (
    <div className="settings-section">
      <div className="settings-group">
        <h3 className="settings-heading">Latest status</h3>
        <pre id="status" className="settings-output" role="region" aria-label="Status message">
          {statusText}
        </pre>
        <div className="settings-actions">
          <TriggerAutoRunButton onTrigger={() => triggerAutoRun()} />
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Run check-open-pr-updates.sh</h3>
        <div className="settings-field">
          <label htmlFor={PR_NUMBERS_FIELD.id}>{PR_NUMBERS_FIELD.label}</label>
          <ContextRunScriptTextInput
            id={PR_NUMBERS_FIELD.id}
            name={PR_NUMBERS_FIELD.name}
            type={PR_NUMBERS_FIELD.type}
            placeholder={PR_NUMBERS_FIELD.placeholder}
            filterStateKey={PR_NUMBERS_FIELD.key}
          />
        </div>
        <div className="settings-actions">
          <Button
            id="run-script-btn"
            variant="primary"
            onClick={() => {
              persistRunScriptOptions();
              runScript();
            }}
          >
            Run script
          </Button>
          <QuickCheckButton onCheck={() => handleQuickCheck()} />
          <Button id="ack-only-btn" onClick={() => handleAckOnly()}>
            Apply ack only
          </Button>
          <Button id="clear-only-btn" onClick={() => handleClearOnly()}>
            Apply clear only
          </Button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Labels</h3>
        <div className="settings-field">
          <label htmlFor="apply-label-select">Apply existing GitHub label to selected PR(s)</label>
          <div className="settings-actions">
            <ApplyLabelSelect />
            <Button id="apply-label-btn" onClick={() => handleApplyLabelClick()}>
              Apply label
            </Button>
            <Button id="refresh-labels-btn" icon="refresh" title="Reload labels for the current repo" onClick={() => refreshLabels()}>
              Reload labels
            </Button>
          </div>
        </div>
      </div>

      <details className="settings-group settings-details">
        <summary>Latest request output</summary>
        <pre id="output" className="settings-output" role="region" aria-label="Latest request output">
          {outputText}
        </pre>
      </details>
    </div>
  );
}
