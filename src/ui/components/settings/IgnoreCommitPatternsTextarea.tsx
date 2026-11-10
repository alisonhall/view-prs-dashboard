import { useRuleField } from '../../state/useRuleField';

/**
 * Change detection's commit message patterns (regular expressions, one per
 * line): commits matching one don't mark a PR CHANGED. FilterStateContext's
 * `changeFilterIgnoreCommitPatterns`; its help text is #commit-patterns-help.
 */
export function IgnoreCommitPatternsTextarea() {
  // Every repo's, or the repo's own (Settings › Rules for a repo).
  const { value, setValue } = useRuleField('changeFilterIgnoreCommitPatterns');
  return (
    <textarea
      id="change-filter-ignore-commit-patterns"
      name="changeFilterIgnoreCommitPatterns"
      rows={4}
      placeholder={'^docs: \n^test: \n^chore: update dependencies\n^style: formatting'}
      aria-describedby="commit-patterns-help"
      value={String(value ?? '')}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
