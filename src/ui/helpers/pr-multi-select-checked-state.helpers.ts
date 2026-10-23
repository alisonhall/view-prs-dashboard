// Which options of a multi-select filter list start checked
// (MultiSelectListPortals, and index.html.test.js's harness): the options
// already checked if any, else the selections restored from user defaults.
// shouldClearPending says the restored selections have now been applied.
//
// `normalizeToken`, when given, is used only for matching (e.g. the label
// lists' case/whitespace-insensitive comparison) - the returned items keep
// each option's original `value`/`label` untouched.
export interface SeedCheckedStateOptions {
  existingChecked?: unknown[];
  pendingSelections?: unknown[] | null;
  normalizeToken?: (value: unknown) => unknown;
}

export interface SeededCheckedState<O> {
  items: Array<O & { checked: boolean }>;
  shouldClearPending: boolean;
}

export const seedCheckedState = <O extends { value?: unknown }>(
  options: O[] | null | undefined,
  { existingChecked = [], pendingSelections = null, normalizeToken }: SeedCheckedStateOptions = {},
): SeededCheckedState<O> => {
  const normalize = typeof normalizeToken === "function" ? normalizeToken : (value: unknown) => value;
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
