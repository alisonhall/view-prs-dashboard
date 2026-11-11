import { Button } from '../ui/Button';
import { useFilterState } from '../../state/FilterStateContext';
import { useOutputText } from '../../state/OutputTextContext';
import { useRepoLabels } from '../../state/RepoLabelsContext';
import { useStatusText } from '../../state/StatusTextContext';
import { useAckLabelActions } from '../../state/useAckLabelActions';
import {
  QUICK_CHECK_ALL_BUTTON_LABEL,
  QUICK_CHECK_OPEN_AND_MERGED_BUTTON_LABEL,
  useQuickCheckActions,
} from '../../state/useQuickCheckActions';
import { useRunScript } from '../../state/useRunScript';
import { useTriggerAutoRun } from '../../state/useTriggerAutoRun';
import { ApplyLabelSelect } from './ApplyLabelSelect';
import { ContextRunScriptTextInput } from './ContextRunScriptTextInput';
import { QUICK_CHECK_LIMITS, QuickCheckButton } from './QuickCheckButton';
import { ScriptOptions } from './ScriptOptions';
import { TriggerAutoRunButton } from './TriggerAutoRunButton';
import { PR_NUMBERS_FIELD } from './settings-fields';
import {
  describeApplyLabelTargets,
  getSelectedPrNumbersFromInput,
} from '../../helpers/pr-selected-pr-numbers.helpers.ts';

/**
 * The Tools drawer's "Run & check" (UI_REDESIGN_PLAN.md, phase 9b), each
 * part saying what it does:
 * - the latest status message, and "Full refresh now";
 * - Quick check: "Quick check open and latest merged" and "Quick check all"
 *   (once in the app header);
 * - the PR numbers to run on, with Run script, Quick check and Apply ack
 *   only / Undo ack, and Run script's options, folded (once Settings'
 *   Script options);
 * - a label to apply to them, with the repo's labels reloadable;
 * - the latest request's output, folded.
 *
 * #status and #output keep their ids: PrDataProvider's last-resort viewer
 * login reads the script's "Viewer: <login>" line from them.
 */
export function RunCheckSection() {
  const { statusText } = useStatusText();
  const { outputText } = useOutputText();
  const { values, setValue, persistRunScriptOptions } = useFilterState();
  const runScript = useRunScript();
  const triggerAutoRun = useTriggerAutoRun();
  const { handleQuickCheck, handleQuickCheckOpenAndMerged, handleQuickCheckAll } = useQuickCheckActions();
  const { handleAckOnly, handleClearOnly, handleApplyLabelClick } = useAckLabelActions();
  const { refresh: refreshLabels } = useRepoLabels();

  return (
    <div className="settings-section">
      <div className="settings-group">
        <h3 className="settings-heading">Latest status</h3>
        <p className="settings-hint">The result of the latest thing done here or on a row: a run, a check, an Ack.</p>
        <pre id="status" className="settings-output" role="region" aria-label="Status message">
          {statusText}
        </pre>
        <div className="settings-actions">
          <TriggerAutoRunButton onTrigger={() => triggerAutoRun()} />
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Quick check</h3>
        <p className="settings-hint">
          Asks GitHub which PRs changed since they were last fetched, without fetching their details. Those that changed
          are updated soon after.
        </p>
        <div className="settings-actions">
          <QuickCheckButton
            id="quick-check-open-merged-btn"
            testId="quick-check-open-merged-button"
            label={QUICK_CHECK_OPEN_AND_MERGED_BUTTON_LABEL}
            title={`What the background quick check covers: each repo's open PRs and its latest merged ones, as a full refresh lists them, and the PRs added one by one (Sources) - a cheap listing per repo.\n${QUICK_CHECK_LIMITS}`}
            onCheck={() => handleQuickCheckOpenAndMerged()}
          />
          <QuickCheckButton
            id="quick-check-all-btn"
            testId="quick-check-all-button"
            label={QUICK_CHECK_ALL_BUTTON_LABEL}
            title={`Checks every PR row already stored, across every repo - older merged and closed ones too: one call per PR.\n${QUICK_CHECK_LIMITS}`}
            onCheck={() => handleQuickCheckAll()}
          />
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Run check-open-pr-updates.sh</h3>
        <p className="settings-hint">
          Run script fetches PRs in full: those numbered here (a row&apos;s checkbox adds it), or with none, the repo&apos;s open
          PRs and its latest merged and closed ones. Apply ack only acks the PRs numbered, as their rows&apos; Ack buttons would -
          each CHANGED one goes back to NO_CHANGE until there&apos;s new activity - and Undo ack takes that back.
        </p>
        <div className="settings-field">
          <label htmlFor={PR_NUMBERS_FIELD.id}>{PR_NUMBERS_FIELD.label}</label>
          <div className="settings-actions settings-field-with-action">
            <ContextRunScriptTextInput
              id={PR_NUMBERS_FIELD.id}
              name={PR_NUMBERS_FIELD.name}
              type={PR_NUMBERS_FIELD.type}
              placeholder={PR_NUMBERS_FIELD.placeholder}
              filterStateKey={PR_NUMBERS_FIELD.key}
              describedBy="pr-numbers-hint"
            />
            {/* The rows' checkboxes show what's in the field, so emptying
                it unticks them all. */}
            <Button
              id="clear-pr-numbers-btn"
              disabled={!String(values[PR_NUMBERS_FIELD.key] ?? '').trim()}
              onClick={() => setValue(PR_NUMBERS_FIELD.key, '')}
            >
              Clear
            </Button>
          </div>
          <p id="pr-numbers-hint" className="settings-hint">
            A row&apos;s checkbox in the table adds its PR here, and takes it out again. Clear empties the field, unticking
            them all.
          </p>
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
            Undo ack
          </Button>
        </div>
        <details className="settings-details">
          <summary>Options for Run script</summary>
          <div className="settings-group">
            <p className="settings-hint">Only Run script uses these. They&apos;re saved when a run starts.</p>
            <ScriptOptions />
          </div>
        </details>
      </div>

      <div className="settings-group">
        <h3 className="settings-heading">Labels</h3>
        <p className="settings-hint">
          Adds a label the repo already has on GitHub to the PRs in &quot;PR number(s)&quot; above - the rows ticked in the
          table, and any numbers typed there.
        </p>
        <div className="settings-field">
          <label htmlFor="apply-label-select">Apply existing GitHub label to selected PR(s)</label>
          <div className="settings-actions">
            <ApplyLabelSelect />
            <Button id="apply-label-btn" aria-describedby="apply-label-targets" onClick={() => handleApplyLabelClick()}>
              Apply label
            </Button>
            <Button id="refresh-labels-btn" icon="refresh" title="Reload labels for the current repo" onClick={() => refreshLabels()}>
              Reload labels
            </Button>
          </div>
          {/* Apply label's description (read with it), not a live region:
              that would speak on every keystroke in "PR number(s)". */}
          <p id="apply-label-targets" className="settings-hint">
            {describeApplyLabelTargets(getSelectedPrNumbersFromInput(values[PR_NUMBERS_FIELD.key]))}
          </p>
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
