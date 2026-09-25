// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderViewerFilterSetupHelpers fallback.
export const { createPrRenderViewerFilterSetupHelpers } = (() => {
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
})();
