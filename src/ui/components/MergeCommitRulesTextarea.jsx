/**
 * MergeCommitRulesTextarea - one of the "Merge commits" rule lists (headline
 * patterns or logins, one per line), backed by FilterStateContext. For the
 * patterns list it also names any line that isn't a valid regular
 * expression, since those are skipped when matching
 * (pr-merge-commit-rules.helpers.ts).
 *
 * @module components/MergeCommitRulesTextarea
 */

import { useFilterState } from '../state/FilterStateContext';
import { isValidHeadlinePattern, parseRuleLines } from '../helpers/pr-merge-commit-rules.helpers.ts';

export function MergeCommitRulesTextarea({ id, filterStateKey, placeholder, validatePatterns = false }) {
  const { values, setValue } = useFilterState();
  const text = String(values[filterStateKey] ?? '');
  const invalidLines = validatePatterns ? parseRuleLines(text).filter((line) => !isValidHeadlinePattern(line)) : [];

  return (
    <>
      <textarea
        id={id}
        name={filterStateKey}
        rows="3"
        placeholder={placeholder}
        aria-describedby="merge-commit-rules-help"
        value={text}
        onChange={(e) => setValue(filterStateKey, e.target.value)}
      />
      {invalidLines.length > 0 && (
        <p className="subtle-copy" role="status">
          Skipped, not a valid regular expression: {invalidLines.map((line) => `"${line}"`).join(', ')}
        </p>
      )}
    </>
  );
}
