// A timestamp's milliseconds for sorting; unparseable or missing values
// sort first (-Infinity).
export const parseSortableTime = (value: unknown): number => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};
