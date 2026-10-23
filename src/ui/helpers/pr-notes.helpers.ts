// A notes list field (or a legacy single string) as the list of strings the
// multi-entry inputs show, always with at least one (possibly empty) entry.
const normalizeNotesListForUi = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item: unknown) => String(item ?? ""))
      .filter((item) => item.length > 0);
    return normalized.length ? normalized : [""];
  }
  const single = String(value ?? "");
  return single ? [single] : [""];
};

export interface PrNotesHelpers {
  normalizeNotesListForUi: typeof normalizeNotesListForUi;
}

const createPrNotesHelpers = (): PrNotesHelpers => ({
  normalizeNotesListForUi,
});

export { createPrNotesHelpers };
