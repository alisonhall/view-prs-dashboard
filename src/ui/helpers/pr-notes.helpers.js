(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrNotesHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const normalizeNotesListForUi = (value) => {
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => String(item ?? ""))
        .filter((item) => item.length > 0);
      return normalized.length ? normalized : [""];
    }
    const single = String(value ?? "");
    return single ? [single] : [""];
  };

  const createPrNotesHelpers = () => ({
    normalizeNotesListForUi,
  });

  return {
    createPrNotesHelpers,
  };
});
