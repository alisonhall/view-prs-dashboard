import { useChangeFilterActorSelection } from '../../state/ChangeFilterActorSelectionContext';
import { IgnoreCommitPatternsTextarea } from './IgnoreCommitPatternsTextarea';
import { SettingsListDropdown } from './SettingsListDropdown';
import { RepoRuleGroup, RulesScopePicker, SameForEveryRepoNote } from './RepoRulesScope';
import { IGNORE_COMMENT_AUTHORS_LIST, IGNORE_REVIEW_AUTHORS_LIST } from './settings-fields';

/**
 * The Settings drawer's "Change detection" (UI_REDESIGN_PLAN.md, phase 9b):
 * activity that shouldn't mark a PR CHANGED - comments or reviews from
 * picked authors, and commits matching patterns.
 */
export function ChangeDetectionSection() {
  const selection = useChangeFilterActorSelection();
  return (
    <div className="settings-section">
      <RulesScopePicker />
      <div className="settings-group">
        <p className="settings-hint">
          Activity that shouldn&apos;t mark a PR CHANGED, such as bots&apos; notifications or optional reviewers&apos; feedback. It
          applies each time a PR is fetched (an update after a quick check, a full refresh, Run script); a stored PR keeps its
          status until then.
        </p>
        <SameForEveryRepoNote />
        <div className="settings-field">
          <SettingsListDropdown list={IGNORE_COMMENT_AUTHORS_LIST} selection={selection} />
          <p className="subtle-copy">
            💬 <strong>Comments</strong> are general discussion messages in the PR conversation (e.g., bot notifications, questions,
            updates). Use this to filter informational messages that don&apos;t require action.
          </p>
        </div>
        <div className="settings-field">
          <SettingsListDropdown list={IGNORE_REVIEW_AUTHORS_LIST} selection={selection} />
          <p className="subtle-copy">
            ✅ <strong>Reviews</strong> are formal code review submissions with approval/change request states (created via &quot;Review
            changes&quot; button). Use this to ignore optional reviewers whose approval isn&apos;t required.
          </p>
        </div>
        <RepoRuleGroup group="ignoreCommitPatterns">
        <div className="settings-field">
          <label htmlFor="change-filter-ignore-commit-patterns">Ignore commits matching patterns (regex, one per line)</label>
          <IgnoreCommitPatternsTextarea />
          <p className="subtle-copy" id="commit-patterns-help">
            📝 Filter commits by message patterns (e.g., <code>^docs:</code> ignores documentation commits, <code>^test:</code> ignores
            test-only commits).
          </p>
        </div>
        </RepoRuleGroup>
        <p className="subtle-copy">
          <strong>Note:</strong> Approved reviews are always ignored (built-in behavior).
        </p>
      </div>
    </div>
  );
}
