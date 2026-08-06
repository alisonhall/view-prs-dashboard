(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderViewerFilterSetupHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRenderViewerFilterSetupHelpers = ({
    deriveViewerContext,
    commitViewerContext,
    populateFilterOptions,
  } = {}) => {
    const deriveViewerContextSafe =
      typeof deriveViewerContext === "function"
        ? deriveViewerContext
        : () => ({
            currentActorLoginAliases: {},
            currentViewerLogin: "",
          });
    const populateFilterOptionsSafe =
      typeof populateFilterOptions === "function" ? populateFilterOptions : () => {};
    const commitViewerContextSafe =
      typeof commitViewerContext === "function" ? commitViewerContext : () => {};

    const deriveViewerFilterSetup = ({ payload, allEntries, repoFilter } = {}) => {
      const { currentActorLoginAliases, currentViewerLogin } =
        deriveViewerContextSafe({
          payload,
          allEntries,
        });

      commitViewerContextSafe({
        currentActorLoginAliases,
        currentViewerLogin,
      });

      populateFilterOptionsSafe({
        entries: allEntries,
        repoFilter,
        actorsMap: payload?.actorsMap || {},
      });

      return {
        currentActorLoginAliases,
        currentViewerLogin,
      };
    };

    return {
      deriveViewerFilterSetup,
    };
  };

  return {
    createPrRenderViewerFilterSetupHelpers,
  };
});
