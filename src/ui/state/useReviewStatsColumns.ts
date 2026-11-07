import { useCallback, useEffect, useRef, useState } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  normalizeReviewStatsColumnChoices,
  readStoredReviewStatsColumnChoices,
  REVIEW_STATS_COLUMNS_OVERRIDE_KEY,
  storeReviewStatsColumnChoices,
  withReviewStatsColumnShown,
  type ReviewStatsColumnChoices,
} from '../helpers/review-stats-columns.helpers.ts';

const { readUiSessionOverridesOrNull, updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

/**
 * The Review stats table's column choices (its Columns menu), as the PR
 * table's section choices are kept (PrSectionPreferencesProvider): they
 * start from the browser copy, then take the setting saved in
 * user-defaults.json once it's read, unless one was made here first; each
 * change saves both.
 */
export function useReviewStatsColumns() {
  const [choices, setChoices] = useState<ReviewStatsColumnChoices>(() => readStoredReviewStatsColumnChoices() ?? {});
  const hasChosenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    readUiSessionOverridesOrNull().then((overrides) => {
      if (cancelled || hasChosenRef.current || !overrides) return;
      const saved = normalizeReviewStatsColumnChoices(overrides[REVIEW_STATS_COLUMNS_OVERRIDE_KEY]);
      setChoices(saved);
      storeReviewStatsColumnChoices(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Each change builds on the latest choices: a ref, set as soon as a
  // change is made, so two quick changes don't both start from one render.
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const setColumnShown = useCallback((key: string, shown: boolean) => {
    const next = withReviewStatsColumnShown(choicesRef.current, key, shown);
    hasChosenRef.current = true;
    choicesRef.current = next;
    setChoices(next);
    storeReviewStatsColumnChoices(next);
    updateUiSessionOverride(REVIEW_STATS_COLUMNS_OVERRIDE_KEY, Object.keys(next).length > 0 ? next : undefined);
  }, []);

  return { choices, setColumnShown };
}
