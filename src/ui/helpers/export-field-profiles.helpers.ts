import { readSavedItems, type SavedItem } from "./saved-items.helpers.ts";

// Export profiles: named sets of Export's chosen fields, one click each in
// Tools › Export. Kept in user-defaults.json (the UI option overrides)
// under EXPORT_FIELD_PROFILES_KEY, so every browser has them.

export const EXPORT_FIELD_PROFILES_KEY = "exportFieldProfiles";

export interface ExportFields {
  dataPaths: string[];
  userStatePaths: string[];
}

export interface ExportFieldProfile extends SavedItem, ExportFields {}

// Field paths as a profile keeps them: strings, trimmed, each once.
const toFieldPaths = (paths: unknown): string[] =>
  Array.from(
    new Set((Array.isArray(paths) ? paths : []).map((path) => String(path ?? "").trim()).filter(Boolean)),
  );

export const toExportFields = (fields: Partial<Record<keyof ExportFields, unknown>> | null | undefined): ExportFields => ({
  dataPaths: toFieldPaths(fields?.dataPaths),
  userStatePaths: toFieldPaths(fields?.userStatePaths),
});

const isSameSet = (left: readonly string[], right: readonly string[]) => {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...b].every((value) => a.has(value));
};

// The same fields, in any order.
export const isSameFields = (left: ExportFields, right: ExportFields): boolean =>
  isSameSet(left.dataPaths, right.dataPaths) && isSameSet(left.userStatePaths, right.userStatePaths);

export const countFields = (fields: ExportFields): number => fields.dataPaths.length + fields.userStatePaths.length;

// Up to this many fields are each named in a description; past it, the
// count and the first few (a profile from Select all has dozens).
const NAMED_FIELDS_LIMIT = 6;
const FIRST_FIELDS_SHOWN = 3;

// What a profile exports: "Data: prNumber, title · User state:
// notesByPrNumber", or past NAMED_FIELDS_LIMIT fields "40 fields (22 data,
// 18 user state): prNumber, title, data.status +37 more".
export const describeExportFields = (fields: ExportFields): string => {
  const total = countFields(fields);
  if (total > NAMED_FIELDS_LIMIT) {
    const first = [...fields.dataPaths, ...fields.userStatePaths].slice(0, FIRST_FIELDS_SHOWN);
    return `${total} fields (${fields.dataPaths.length} data, ${fields.userStatePaths.length} user state): ${first.join(", ")} +${total - first.length} more`;
  }
  return [
    fields.dataPaths.length ? `Data: ${fields.dataPaths.join(", ")}` : "",
    fields.userStatePaths.length ? `User state: ${fields.userStatePaths.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "No fields";
};

// The saved profiles from the overrides (none until one is saved).
export const readExportFieldProfiles = (overrides: Record<string, unknown> | null | undefined): ExportFieldProfile[] =>
  readSavedItems(overrides?.[EXPORT_FIELD_PROFILES_KEY], "profiles", (entry, base) => ({
    ...base,
    ...toExportFields(entry),
  })) ?? [];

// The overrides' value for these profiles (see saved-items.helpers.ts).
export const toExportFieldProfilesValue = (profiles: readonly ExportFieldProfile[]) => ({
  profiles: profiles.map(({ id, name, dataPaths, userStatePaths }) => ({ id, name, dataPaths, userStatePaths })),
});
