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
