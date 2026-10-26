import { useFilterState } from '../../state/FilterStateContext';

/**
 * Change detection's commit message patterns (regular expressions, one per
 * line): commits matching one don't mark a PR CHANGED. FilterStateContext's
 * `changeFilterIgnoreCommitPatterns`; its help text is #commit-patterns-help.
 */
export function IgnoreCommitPatternsTextarea() {
  const { values, setValue } = useFilterState();
  return (
    <textarea
      id="change-filter-ignore-commit-patterns"
      name="changeFilterIgnoreCommitPatterns"
      rows={4}
      placeholder={'^docs: \n^test: \n^chore: update dependencies\n^style: formatting'}
      aria-describedby="commit-patterns-help"
      value={String(values.changeFilterIgnoreCommitPatterns ?? '')}
      onChange={(event) => setValue('changeFilterIgnoreCommitPatterns', event.target.value)}
    />
  );
}
