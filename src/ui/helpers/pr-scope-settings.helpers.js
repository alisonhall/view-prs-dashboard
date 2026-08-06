(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsScopeSettingsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
