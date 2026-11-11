import { useRuleField } from '../../state/useRuleField';
import { isValidHeadlinePattern, parseRuleLines } from '../../helpers/pr-merge-commit-rules.helpers.ts';

/**
 * One of the Merge commits rules' lists (one entry per line), bound to its
 * FilterStateContext key. With `validatePatterns`, lines that aren't
 * valid regular expressions are named (they're skipped). Its help text is
 * #merge-commit-rules-help.
 */
export interface MergeCommitRulesTextareaProps {
  id: string;
  filterStateKey: string;
  placeholder?: string;
  validatePatterns?: boolean;
}

export function MergeCommitRulesTextarea({ id, filterStateKey, placeholder, validatePatterns = false }: MergeCommitRulesTextareaProps) {
  // The headline patterns: every repo's, or the repo's own (Settings › Rules
  // for a repo); the logins are the same for every repo.
  const { value, setValue } = useRuleField(filterStateKey);
  const text = String(value ?? '');
  const invalidLines = validatePatterns ? parseRuleLines(text).filter((line) => !isValidHeadlinePattern(line)) : [];
  return (
    <>
      <textarea
        id={id}
        name={filterStateKey}
        rows={3}
        placeholder={placeholder}
        aria-describedby="merge-commit-rules-help"
        value={text}
        onChange={(event) => setValue(event.target.value)}
      />
      {invalidLines.length > 0 && (
        <p className="subtle-copy" role="status">
          Skipped, not a valid regular expression: {invalidLines.map((line) => `"${line}"`).join(', ')}
        </p>
      )}
    </>
  );
}
