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
