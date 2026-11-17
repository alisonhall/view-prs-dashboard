import { parsePrNumbersInput } from "./form-parsing.helpers.ts";

// The "PR number(s)" field's selection as a list, and toggling one PR in or
// out of it (PrSelectionCell, through FilterStateProvider).

export const getSelectedPrNumbersFromInput = (prNumbersInput: unknown): string[] =>
  parsePrNumbersInput(String(prNumbersInput || ""));

// Returns the new comma-joined field value, or the input unchanged when
// prNumber isn't a valid number.
export const toggleSelectedPrNumber = <V>(
  prNumbersInput: V,
  prNumber: unknown,
  shouldSelect: boolean,
): V | string => {
  const normalizedPrNumber = String(prNumber || "").trim();
  if (!/^\d+$/.test(normalizedPrNumber)) {
    return prNumbersInput;
  }

  const current = getSelectedPrNumbersFromInput(prNumbersInput);
  const next = shouldSelect
    ? current.includes(normalizedPrNumber)
      ? current
      : [...current, normalizedPrNumber]
    : current.filter((value) => value !== normalizedPrNumber);

  return next.join(",");
};

// How many of `prNumbers` (a section's rows) the field has: the section's
// select-all checkbox is ticked for all, a dash for some.
export const selectionStateOf = (prNumbersInput: unknown, prNumbers: readonly string[]): 'all' | 'some' | 'none' => {
  const wanted = prNumbers.filter((value) => /^\d+$/.test(value));
  if (wanted.length === 0) return 'none';
  const current = new Set(getSelectedPrNumbersFromInput(prNumbersInput));
  const count = wanted.filter((value) => current.has(value)).length;
  return count === 0 ? 'none' : count === wanted.length ? 'all' : 'some';
};

// The field with every one of `prNumbers` added (in their order, after
// those already there) or taken out; the rest are left as they were.
export const setSelectedPrNumbers = (prNumbersInput: unknown, prNumbers: readonly string[], shouldSelect: boolean): string => {
  const numbers = prNumbers.map((value) => String(value || '').trim()).filter((value) => /^\d+$/.test(value));
  const current = getSelectedPrNumbersFromInput(prNumbersInput);
  if (!shouldSelect) {
    const removing = new Set(numbers);
    return current.filter((value) => !removing.has(value)).join(",");
  }
  const next = [...current];
  numbers.forEach((value) => {
    if (!next.includes(value)) next.push(value);
  });
  return next.join(",");
};

// The most PR numbers describeApplyLabelTargets lists before "and N more".
const LISTED_TARGETS = 8;

// Which PRs Tools › Run & check's Apply label adds the label to: those in
// the field (RunCheckSection says so under the button).
export const describeApplyLabelTargets = (prNumbers: string[]): string => {
  if (prNumbers.length === 0) {
    return 'No PRs to apply it to yet: tick rows in the table, or type their numbers in "PR number(s)" above.';
  }
  const listed = prNumbers.slice(0, LISTED_TARGETS).map((number) => `#${number}`).join(", ");
  const more = prNumbers.length > LISTED_TARGETS ? ` and ${prNumbers.length - LISTED_TARGETS} more` : "";
  return `Applies to ${prNumbers.length} ${prNumbers.length === 1 ? "PR" : "PRs"}: ${listed}${more}.`;
};
