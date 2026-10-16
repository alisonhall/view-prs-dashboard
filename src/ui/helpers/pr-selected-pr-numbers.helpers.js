// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js's
// getSelectedPrNumbers/updateSelectedPrNumbers (which read/wrote the
// "#pr-numbers" DOM input directly) - PrSelectionCell.jsx now reads/writes
// the same value via FilterStateProvider's Context instead, so this module
// holds only the pure parse/toggle logic, with no DOM dependency at all.
import { parsePrNumbersInput } from "./form-parsing.helpers.js";

export const getSelectedPrNumbersFromInput = (prNumbersInput) =>
  parsePrNumbersInput(String(prNumbersInput || ""));

export const toggleSelectedPrNumber = (prNumbersInput, prNumber, shouldSelect) => {
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
