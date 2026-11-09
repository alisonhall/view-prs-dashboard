import { createPrTableFilterChipsHelpers } from "./pr-table-filter-chips.helpers.ts";
import { readSavedItems, type SavedItem } from "./saved-items.helpers.ts";

// Saved filter views: named sets of the filter bar's filters, one click
// each above the table. Kept in user-defaults.json (the UI option
// overrides) under SAVED_FILTER_VIEWS_KEY, so every browser has them.

const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

export const SAVED_FILTER_VIEWS_KEY = "savedFilterViews";

// The filter bar's field filters (FilterStateContext keys): the search,
// the checkboxes and the notes selects. Each one's "no filter" value.
export const VIEW_FIELD_DEFAULTS = {
  filterSearch: "",
  filterPrNumbers: "",
  onlyNeedsAttention: false,
  alwaysShowInReview: false,
  onlyOpenConversationsWithMe: false,
  onlyWaitingOnMe: false,
  onlyThreadsToCheck: false,
  filterCustomComments: "",
  filterOtherNotes: "",
  filterPrDifficulty: "",
  filterStories: "",
  filterAnalysisOfPr: "",
} as const;

export type ViewFieldKey = keyof typeof VIEW_FIELD_DEFAULTS;
export const VIEW_FIELD_KEYS = Object.keys(VIEW_FIELD_DEFAULTS) as ViewFieldKey[];

// The filter bar's lists (RowFilterSelectionContext ids).
export const VIEW_LIST_IDS = ["label-list", "exclude-label-list", "author-list", "assigned-list", "approver-list"] as const;
export type ViewListId = (typeof VIEW_LIST_IDS)[number];

export interface ViewFilters {
  fields: { [K in ViewFieldKey]: (typeof VIEW_FIELD_DEFAULTS)[K] extends boolean ? boolean : string };
  lists: Record<ViewListId, string[]>;
}

export interface SavedFilterView extends SavedItem {
  filters: ViewFilters;
}

const isBooleanField = (key: ViewFieldKey) => typeof VIEW_FIELD_DEFAULTS[key] === "boolean";

// Filters as a view keeps them: every field (its default when missing or
// of the wrong kind), and each list's values, trimmed, each once.
export const toViewFilters = (
  fields: Record<string, unknown> | null | undefined,
  lists: Partial<Record<string, Iterable<unknown> | null | undefined>> | null | undefined,
): ViewFilters => {
  const readField = (key: ViewFieldKey) => {
    const value = fields?.[key];
    return isBooleanField(key) ? value === true : typeof value === "string" ? value.trim() : "";
  };
  const readList = (id: ViewListId) => {
    const values = lists?.[id];
    const items = values && typeof values === "object" && Symbol.iterator in values ? Array.from(values) : [];
    return Array.from(new Set(items.map((value) => String(value ?? "").trim()).filter(Boolean)));
  };
  return {
    fields: Object.fromEntries(VIEW_FIELD_KEYS.map((key) => [key, readField(key)])) as ViewFilters["fields"],
    lists: Object.fromEntries(VIEW_LIST_IDS.map((id) => [id, readList(id)])) as ViewFilters["lists"],
  };
};

// The same filters: every field equal, and each list the same values in
// any order.
export const isSameFilters = (left: ViewFilters, right: ViewFilters): boolean =>
  VIEW_FIELD_KEYS.every((key) => left.fields[key] === right.fields[key]) &&
  VIEW_LIST_IDS.every((id) => {
    const a = new Set(left.lists[id]);
    const b = right.lists[id];
    return a.size === new Set(b).size && b.every((value) => a.has(value));
  });

export const hasAnyFilter = (filters: ViewFilters): boolean => describeViewFilters(filters).length > 0;

// The lists of people (the rest are labels).
const PEOPLE_LIST_IDS: readonly ViewListId[] = ["author-list", "assigned-list", "approver-list"];

// The filters with each person picked as their key (keyOf: their id, for a
// login saved before ids too), each once - so a view compares, and
// applies, by person.
export const withPeopleAsKeys = (filters: ViewFilters, keyOf: (value: string) => string): ViewFilters => ({
  ...filters,
  lists: {
    ...filters.lists,
    ...Object.fromEntries(
      PEOPLE_LIST_IDS.map((id) => [id, Array.from(new Set(filters.lists[id].map((value) => keyOf(value) || value)))]),
    ),
  } as ViewFilters["lists"],
});

// What a view filters on, as the filter chips say it ("Waiting on me",
// "Author: Ann Lee" - nameOfPerson naming the people picked).
export const describeViewFilters = (filters: ViewFilters, nameOfPerson?: (value: string) => string): string[] =>
  buildTableFilterChipsViewModel({
    ...filters.fields,
    includeLabels: filters.lists["label-list"],
    excludeLabels: filters.lists["exclude-label-list"],
    authorLogins: filters.lists["author-list"],
    assignedLogins: filters.lists["assigned-list"],
    approverLogins: filters.lists["approver-list"],
    nameOfPerson,
  }).map((chip) => chip.label);

const withFields = (fields: Partial<ViewFilters["fields"]>): ViewFilters => toViewFilters(fields, {});

// The views offered before any is saved: kept, renamed or deleted like
// any other once one is.
export const STARTER_FILTER_VIEWS: readonly SavedFilterView[] = [
  { id: "starter-needs-attention", name: "Needs attention", filters: withFields({ onlyNeedsAttention: true }) },
  { id: "starter-waiting-on-me", name: "Waiting on me", filters: withFields({ onlyWaitingOnMe: true }) },
  { id: "starter-to-check", name: "Resolved for you to check", filters: withFields({ onlyThreadsToCheck: true }) },
];

// The saved views from the overrides (STARTER_FILTER_VIEWS when none were
// ever saved).
export const readSavedFilterViews = (overrides: Record<string, unknown> | null | undefined): SavedFilterView[] =>
  readSavedItems(overrides?.[SAVED_FILTER_VIEWS_KEY], "views", (entry, base) => {
    const filters = (entry.filters || {}) as { fields?: Record<string, unknown>; lists?: Record<string, unknown> };
    const lists = Object.fromEntries(
      Object.entries(filters.lists || {}).map(([listId, values]) => [listId, Array.isArray(values) ? values : []]),
    );
    return { ...base, filters: toViewFilters(filters.fields, lists) };
  }) ?? STARTER_FILTER_VIEWS.slice();

// The overrides' value for these views (see saved-items.helpers.ts).
export const toSavedFilterViewsValue = (views: readonly SavedFilterView[]) => ({
  views: views.map((view) => ({ id: view.id, name: view.name, filters: view.filters })),
});
