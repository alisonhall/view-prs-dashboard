import { asArray } from "./pr-as-array.helpers.ts";

// The removable chips above the PR table, one per active filter, each with
// what clearing it means: reset a field to its default, or uncheck one
// value in a multi-select list (useTableFilterChips applies it).
export type FilterChipClear =
  | { kind: "field"; key: string; value: unknown }
  | { kind: "list"; listId: string; value: string };

export interface FilterChip {
  id: string;
  label: string;
  clear: FilterChipClear;
}

export interface TableFilterChipsInput {
  scopeMode?: string;
  filterPrNumbers?: string;
  includeLabels?: string[];
  excludeLabels?: string[];
  authorLogins?: string[];
  assignedLogins?: string[];
  approverLogins?: string[];
  alwaysShowInReview?: boolean;
  filterCustomComments?: string;
  filterOtherNotes?: string;
  filterPrDifficulty?: string;
  filterStories?: string;
  filterAnalysisOfPr?: string;
}

const WITH_WITHOUT_LABELS: Record<string, string> = { with: "with", without: "without" };

const STORIES_FILTER_LABELS: Record<string, string> = {
  none: "without any story details",
  "name-only": "with only story name",
  "url-only": "with only story URL",
  "name-and-url": "with story and URL",
};

const createPrTableFilterChipsHelpers = () => {
  const fieldChip = (id: string, label: string, key: string, defaultValue: unknown): FilterChip => ({
    id,
    label,
    clear: { kind: "field", key, value: defaultValue },
  });

  const listChips = (prefix: string, listId: string, values: string[] | null | undefined): FilterChip[] =>
    asArray(values).map((value) => ({
      id: `${listId}:${value}`,
      label: `${prefix}: ${value}`,
      clear: { kind: "list", listId, value },
    }));

  const buildTableFilterChipsViewModel = ({
    scopeMode,
    filterPrNumbers,
    includeLabels,
    excludeLabels,
    authorLogins,
    assignedLogins,
    approverLogins,
    alwaysShowInReview,
    filterCustomComments,
    filterOtherNotes,
    filterPrDifficulty,
    filterStories,
    filterAnalysisOfPr,
  }: TableFilterChipsInput = {}): FilterChip[] => {
    const chips: FilterChip[] = [];

    if (scopeMode && scopeMode !== "all") {
      chips.push(fieldChip("scopeMode", `Scope: ${scopeMode}`, "scopeMode", "all"));
    }
    if (String(filterPrNumbers || "").trim()) {
      chips.push(
        fieldChip(
          "filterPrNumbers",
          `PR #: ${String(filterPrNumbers).trim()}`,
          "filterPrNumbers",
          "",
        ),
      );
    }

    chips.push(...listChips("Label", "label-list", includeLabels));
    chips.push(...listChips("Exclude label", "exclude-label-list", excludeLabels));
    chips.push(...listChips("Author", "author-list", authorLogins));
    chips.push(...listChips("Assigned", "assigned-list", assignedLogins));
    chips.push(...listChips("Approver", "approver-list", approverLogins));

    if (alwaysShowInReview) {
      chips.push(
        fieldChip("alwaysShowInReview", "Always show in review", "alwaysShowInReview", false),
      );
    }

    const withWithoutChip = (id: string, prefix: string, key: string, value: string | undefined) => {
      const normalized = (value && WITH_WITHOUT_LABELS[value]) || value;
      if (!normalized) return;
      chips.push(fieldChip(id, `${prefix}: ${normalized}`, key, ""));
    };

    withWithoutChip("filterCustomComments", "Custom comments", "filterCustomComments", filterCustomComments);
    withWithoutChip("filterOtherNotes", "Other notes", "filterOtherNotes", filterOtherNotes);

    if (filterPrDifficulty) {
      const label = filterPrDifficulty === "not-set" ? "not set" : filterPrDifficulty;
      chips.push(
        fieldChip("filterPrDifficulty", `Difficulty: ${label}`, "filterPrDifficulty", ""),
      );
    }

    if (filterStories) {
      const label = STORIES_FILTER_LABELS[filterStories] || filterStories;
      chips.push(fieldChip("filterStories", `Stories: ${label}`, "filterStories", ""));
    }
    withWithoutChip("filterAnalysisOfPr", "Analysis of PR", "filterAnalysisOfPr", filterAnalysisOfPr);

    return chips;
  };

  return {
    buildTableFilterChipsViewModel,
  };
};

export { createPrTableFilterChipsHelpers };
