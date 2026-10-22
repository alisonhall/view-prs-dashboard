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

export { createPrNotesHelpers };
