// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsPrHttpHelpers fallback.
export const { createPrHttpHelpers } = (() => {
  const createPrHttpHelpers = ({ fetch }) => {
    const postJson = async (url, payload) => {
      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      return { response, result };
    };

    return {
      postJson,
    };
  };

  return {
    createPrHttpHelpers,
  };
})();
