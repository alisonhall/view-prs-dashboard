// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the checked-state
// seeding logic every deleted populateXOptions function (pr-filter-panel
// .helpers.js, index.page.js) used to duplicate per list - moved out
// verbatim into one shared, pure function so react-app.jsx's
// MultiSelectListPortals (the new source of this behavior) and
// index.html.test.js's test harness can both call the same logic instead
// of re-implementing it a second time.
//
// `normalizeToken`, when given, is used only for matching (e.g. the label
// lists' case/whitespace-insensitive comparison) - the returned items keep
// each option's original `value`/`label` untouched.
export const seedCheckedState = (
  options,
  { existingChecked = [], pendingSelections = null, normalizeToken } = {},
) => {
  const normalize = typeof normalizeToken === "function" ? normalizeToken : (value) => value;
  const safeOptions = Array.isArray(options) ? options : [];
  const safeExistingChecked = Array.isArray(existingChecked) ? existingChecked : [];

  const seedSelections =
    safeExistingChecked.length > 0
      ? safeExistingChecked
      : Array.isArray(pendingSelections)
        ? pendingSelections
        : [];
  const selectedTokens = new Set(seedSelections.map((value) => normalize(value)));

  const items = safeOptions.map((option) => ({
    ...option,
    checked: selectedTokens.has(normalize(option.value)),
  }));

  const appliedCount = items.filter((item) => item.checked).length;
  const shouldClearPending =
    Array.isArray(pendingSelections) && (appliedCount > 0 || safeExistingChecked.length > 0);

  return { items, shouldClearPending };
};
