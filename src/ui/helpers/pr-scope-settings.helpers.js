// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsScopeSettingsHelpers fallback.
export const { createPrScopeSettingsHelpers } = (() => {
  const createPrScopeSettingsHelpers = ({
    parseCsvTokens,
    normalizeSelectedScope,
  } = {}) => {
    const parseCsvTokensSafe =
      typeof parseCsvTokens === "function" ? parseCsvTokens : () => [];
    const normalizeSelectedScopeSafe =
      typeof normalizeSelectedScope === "function"
        ? normalizeSelectedScope
        : () => "all";

    const deriveScopeSettings = ({
      filterPrNumbersRaw,
      scopeModeValue,
      optionsUseLastRunScope,
    } = {}) => {
      const filterPrNumbers = parseCsvTokensSafe(filterPrNumbersRaw)
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d+$/.test(value));

      const selectedScope = normalizeSelectedScopeSafe(scopeModeValue);
      const ignoreScopeForPrNumberFilter = filterPrNumbers.length > 0;
      const useLastRunScope =
        typeof optionsUseLastRunScope === "boolean"
          ? optionsUseLastRunScope
          : selectedScope === "last-run";

      return {
        filterPrNumbers,
        selectedScope,
        ignoreScopeForPrNumberFilter,
        useLastRunScope,
      };
    };

    return {
      deriveScopeSettings,
    };
  };

  return {
    createPrScopeSettingsHelpers,
  };
})();
