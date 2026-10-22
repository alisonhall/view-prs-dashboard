// ES module cleanup (see REACT_MIGRATION_PLAN.md): same export shape every
// other pure src/ui/helpers file in this folder uses (e.g.
// pr-selected-filters.helpers.js) - a factory with no React/Context import,
// so it's independently unit-testable and reusable by both
// useTableFilterChips.jsx and this file's own test.
const createPrTableFilterChipsHelpers = () => {
  const asArray = (value) => (Array.isArray(value) ? value : []);

  const fieldChip = (id, label, key, defaultValue) => ({
    id,
    label,
    clear: { kind: "field", key, value: defaultValue },
  });

  const listChips = (prefix, listId, values) =>
    asArray(values).map((value) => ({
      id: `${listId}:${value}`,
      label: `${prefix}: ${value}`,
      clear: { kind: "list", listId, value },
    }));

  const WITH_WITHOUT_LABELS = { with: "with", without: "without" };

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
    filterRallyStories,
    filterRallyLinks,
    filterAnalysisOfPr,
  } = {}) => {
    const chips = [];

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

    const withWithoutChip = (id, prefix, key, value) => {
      const normalized = WITH_WITHOUT_LABELS[value] || value;
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

    withWithoutChip("filterRallyStories", "Rally stories", "filterRallyStories", filterRallyStories);
    withWithoutChip("filterRallyLinks", "Rally links", "filterRallyLinks", filterRallyLinks);
    withWithoutChip("filterAnalysisOfPr", "Analysis of PR", "filterAnalysisOfPr", filterAnalysisOfPr);

    return chips;
  };

  return {
    buildTableFilterChipsViewModel,
  };
};

export { createPrTableFilterChipsHelpers };
