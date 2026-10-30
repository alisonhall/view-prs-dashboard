import { MergeCommitRulesTextarea } from './MergeCommitRulesTextarea';

/**
 * The Settings drawer's "Merge commits" (UI_REDESIGN_PLAN.md, phase 9b):
 * what counts as a merge commit - headline patterns, and logins whose
 * commits always do (bots). FilterStateContext's mergeCommit* keys, saved
 * as `mergeCommitRules`.
 */
export function MergeCommitsSection() {
  return (
    <div className="settings-section">
      <div className="settings-group">
        <p className="subtle-copy" id="merge-commit-rules-help">
          🔀 A commit counts as a merge when its headline matches one of the patterns, or when every one of its authors is in the logins
          list (e.g. bots). Merge commits don&apos;t mark a PR CHANGED, aren&apos;t listed in the Author column, and are what &quot;Exclude
          merge-only commit activity&quot; leaves out. Default pattern: <code>^Merge\b</code>.
        </p>
        <div className="settings-field">
          <label htmlFor="merge-commit-headline-patterns">Headline patterns (regular expressions, one per line, not case-sensitive)</label>
          <MergeCommitRulesTextarea
            id="merge-commit-headline-patterns"
            filterStateKey="mergeCommitHeadlinePatterns"
            placeholder={'^Merge\\b\n^Revert "Merge'}
            validatePatterns
          />
        </div>
        <div className="settings-field">
          <label htmlFor="merge-commit-logins">Logins whose commits always count as merges (one per line)</label>
          <MergeCommitRulesTextarea id="merge-commit-logins" filterStateKey="mergeCommitLogins" placeholder={'dependabot[bot]\nrenovate[bot]'} />
        </div>
      </div>
    </div>
  );
}
