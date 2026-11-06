import { createPrTableFilterChipsHelpers } from "./pr-table-filter-chips.helpers.ts";

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

export interface SavedFilterView {
  id: string;
  name: string;
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

// What a view filters on, as the filter chips say it ("Waiting on me",
// "Author: ann").
export const describeViewFilters = (filters: ViewFilters): string[] =>
  buildTableFilterChipsViewModel({
    ...filters.fields,
    includeLabels: filters.lists["label-list"],
    excludeLabels: filters.lists["exclude-label-list"],
    authorLogins: filters.lists["author-list"],
    assignedLogins: filters.lists["assigned-list"],
    approverLogins: filters.lists["approver-list"],
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
// ever saved). Entries without a name are dropped; an id is made for one
// without (a hand edit).
export const readSavedFilterViews = (overrides: Record<string, unknown> | null | undefined): SavedFilterView[] => {
  const saved = overrides?.[SAVED_FILTER_VIEWS_KEY];
  if (!saved || typeof saved !== "object" || !Array.isArray((saved as { views?: unknown }).views)) {
    return STARTER_FILTER_VIEWS.slice();
  }
  const seen = new Set<string>();
  return ((saved as { views: unknown[] }).views || []).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const view = entry as { id?: unknown; name?: unknown; filters?: { fields?: Record<string, unknown>; lists?: Record<string, unknown> } };
    const name = String(view.name ?? "").trim();
    if (!name) return [];
    let id = String(view.id ?? "").trim() || `view-${index}`;
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const lists = Object.fromEntries(
      Object.entries(view.filters?.lists || {}).map(([listId, values]) => [listId, Array.isArray(values) ? values : []]),
    );
    return [{ id, name, filters: toViewFilters(view.filters?.fields, lists) }];
  });
};

// The overrides' value for these views. An object, not an array: the
// overrides writer drops empty arrays, which would bring the starter views
// back once every view was deleted.
export const toSavedFilterViewsValue = (views: readonly SavedFilterView[]) => ({
  views: views.map((view) => ({ id: view.id, name: view.name, filters: view.filters })),
});

// Whether no other view has this name (ignoring case); false for an empty
// one.
export const isViewNameFree = (views: readonly SavedFilterView[], name: string, exceptId = ""): boolean => {
  const wanted = name.trim().toLowerCase();
  return Boolean(wanted) && !views.some((view) => view.id !== exceptId && view.name.trim().toLowerCase() === wanted);
};

export const makeViewId = (nowMs: number = Date.now()): string => `view-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
