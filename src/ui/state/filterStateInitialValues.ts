import type { FilterValues } from './filterValuesStore';
import { NOTES_FILTER_FIELDS } from '../components/filter-bar/filter-bar-fields';
import { ATTENTION_CHECKBOX_FIELDS, PR_NUMBERS_FIELD, SCRIPT_CHECKBOX_FIELDS, SCRIPT_TEXT_FIELDS } from '../components/settings/settings-fields';
import { DEFAULT_MERGE_COMMIT_RULES, formatRuleLines } from '../helpers/pr-merge-commit-rules.helpers.ts';

/**
 * FilterStateProvider's starting values: every field's default, before a
 * saved restore applies (react-app.tsx, and the integration
 * harness, so both start the same). Same values as getUiOptionDefaults()
 * (helpers/pr-ui-option-persistence.helpers.ts); no DOM dependency.
 */
export function buildFilterStateInitialValues(): FilterValues {
  const initialValues: FilterValues = {
    scopeMode: 'all',
    alwaysShowInReview: false,
    attentionNoActivityMode: 'all',
    openMode: 'none',
    filterPrNumbers: '',
    attentionAuthorThreadResolutionMode: 'allow-all',
    changeFilterIgnoreCommitPatterns: '',
    mergeCommitHeadlinePatterns: formatRuleLines(DEFAULT_MERGE_COMMIT_RULES.headlinePatterns),
    mergeCommitLogins: '',
  };
  // The Settings drawer's fields (Run & check's PR numbers, the attention
  // rules' toggles, Script options).
  [PR_NUMBERS_FIELD, ...ATTENTION_CHECKBOX_FIELDS, ...SCRIPT_TEXT_FIELDS, ...SCRIPT_CHECKBOX_FIELDS].forEach((field) => {
    initialValues[field.key] = field.defaultValue;
  });
  // The filter bar's notes filters start at "Any".
  NOTES_FILTER_FIELDS.forEach((field) => {
    initialValues[field.key] = field.options[0]?.value ?? '';
  });
  return initialValues;
}
