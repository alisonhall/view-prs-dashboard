(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrHttpHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
