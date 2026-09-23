(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFilterPanelHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrFilterPanelHelpers = ({
    getPreferredActorKey,
    resolveActorDisplayName,
    collectAssignedUsers,
    collectApproversFromRow,
    extractRowLabelNames,
    normalizeFilterToken,
    getPendingAuthorFilterSelections,
    setPendingAuthorFilterSelections,
    getPendingAssignedFilterSelections,
    setPendingAssignedFilterSelections,
    getPendingApproverFilterSelections,
    setPendingApproverFilterSelections,
    getPendingLabelFilterSelections,
    setPendingLabelFilterSelections,
    getPendingExcludeLabelFilterSelections,
    setPendingExcludeLabelFilterSelections,
    renderMultiSelectList,
    // Renders the "Applied filters: ..." summary line + chip list via React
    // (react-app.jsx's renderReactFilterSummary, mounted into
    // #management-filter-summary-root - see AppliedFilterSummary.jsx).
    // Optional and defaults to a no-op so every existing call site/unit
    // test keeps working unmodified before React has mounted it.
    renderFilterSummary,
    documentRef,
    // Phase 6 (see REACT_MIGRATION_PLAN.md): optional - when provided,
    // returns a migrated field's current value from FilterStateProvider's
    // Context by its Context key (not DOM id), or undefined for an
    // unmigrated key/before the provider mounts. Defaults to always
    // undefined so every existing call site (and every existing unit
    // test, which doesn't pass this) falls back to its original DOM read
    // unchanged.
    getFilterStateValue,
    // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
    // optional shared per-entry derived-value cache (see
    // pr-entry-derived-cache.helpers.js) - defaults to an uncached
    // passthrough so every existing call site/unit test keeps working
    // unmodified. When provided, label/assignee/approver extraction for
    // an unchanged entry (same object reference across renders) is reused
    // instead of recomputed.
    getOrCompute,
  } = {}) => {
    const getFilterStateValueSafe =
      typeof getFilterStateValue === "function" ? getFilterStateValue : () => undefined;
    const getOrComputeSafe =
      typeof getOrCompute === "function" ? getOrCompute : (_entry, _key, compute) => compute();
    // Phase 2 React migration hook (see REACT_MIGRATION_PLAN.md): when
    // provided, `renderMultiSelectList(listId, items)` renders the
    // checkbox items for a multi-select list (items: [{value, label,
    // checked}]) and returns true once it has done so, letting the caller
    // skip its own manual DOM-building fallback below. Optional and
    // defaults to "not handled" so every existing call site keeps working
    // unmodified (and every existing unit test, which doesn't pass this)
    // until a given list is actually converted.
    const renderMultiSelectListSafe =
      typeof renderMultiSelectList === "function"
        ? renderMultiSelectList
        : () => false;
    const renderFilterSummarySafe =
      typeof renderFilterSummary === "function" ? renderFilterSummary : () => false;
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function" ? getPreferredActorKey : () => "";
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login) => String(login || "").trim();
    const collectAssignedUsersSafe =
      typeof collectAssignedUsers === "function" ? collectAssignedUsers : () => [];
    const collectApproversFromRowSafe =
      typeof collectApproversFromRow === "function" ? collectApproversFromRow : () => [];
    const extractRowLabelNamesSafe =
      typeof extractRowLabelNames === "function" ? extractRowLabelNames : () => [];
    // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
    // cached per-entry (not per-row) since an entry's own object identity
    // is what's stable across renders (see pr-entry-derived-cache.helpers.js) -
    // these three keep their original xxxSafe(row) call sites below
    // untouched, wrapped one level up here instead.
    const extractRowLabelNamesForEntry = (entry) =>
      getOrComputeSafe(entry, "labels", () => extractRowLabelNamesSafe(entry?.data || {}));
    const collectAssignedUsersForEntry = (entry) =>
      getOrComputeSafe(entry, "assignedUsers", () => collectAssignedUsersSafe(entry?.data || {}));
    const collectApproversForEntry = (entry) =>
      getOrComputeSafe(entry, "approvers", () => collectApproversFromRowSafe(entry?.data || {}));
    const normalizeFilterTokenSafe =
      typeof normalizeFilterToken === "function"
        ? normalizeFilterToken
        : (value) => String(value || "").trim().toLowerCase();

    const getPendingAuthorFilterSelectionsSafe =
      typeof getPendingAuthorFilterSelections === "function"
        ? getPendingAuthorFilterSelections
        : () => null;
    const setPendingAuthorFilterSelectionsSafe =
      typeof setPendingAuthorFilterSelections === "function"
        ? setPendingAuthorFilterSelections
        : () => {};
    const getPendingAssignedFilterSelectionsSafe =
      typeof getPendingAssignedFilterSelections === "function"
        ? getPendingAssignedFilterSelections
        : () => null;
    const setPendingAssignedFilterSelectionsSafe =
      typeof setPendingAssignedFilterSelections === "function"
        ? setPendingAssignedFilterSelections
        : () => {};
    const getPendingApproverFilterSelectionsSafe =
      typeof getPendingApproverFilterSelections === "function"
        ? getPendingApproverFilterSelections
        : () => null;
    const setPendingApproverFilterSelectionsSafe =
      typeof setPendingApproverFilterSelections === "function"
        ? setPendingApproverFilterSelections
        : () => {};
    const getPendingLabelFilterSelectionsSafe =
      typeof getPendingLabelFilterSelections === "function"
        ? getPendingLabelFilterSelections
        : () => null;
    const setPendingLabelFilterSelectionsSafe =
      typeof setPendingLabelFilterSelections === "function"
        ? setPendingLabelFilterSelections
        : () => {};
    const getPendingExcludeLabelFilterSelectionsSafe =
      typeof getPendingExcludeLabelFilterSelections === "function"
        ? getPendingExcludeLabelFilterSelections
        : () => null;
    const setPendingExcludeLabelFilterSelectionsSafe =
      typeof setPendingExcludeLabelFilterSelections === "function"
        ? setPendingExcludeLabelFilterSelections
        : () => {};

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const getListElement = (listId) => {
      const doc = getDocument();
      if (!doc || typeof doc.getElementById !== "function") {
        return null;
      }
      return doc.getElementById(listId);
    };

    const getSelectedMultiSelectValues = (listId) => {
      const list = getListElement(listId);
      if (!list || typeof list.querySelectorAll !== "function") return [];

      const checkboxes = Array.from(
        list.querySelectorAll("input[type='checkbox']:checked"),
      );
      return checkboxes
        .map((checkbox) => String(checkbox.value || "").trim())
        .filter(Boolean);
    };

    const getSelectedAuthorLogins = () => getSelectedMultiSelectValues("author-list");
    const getSelectedAssignedLogins = () =>
      getSelectedMultiSelectValues("assigned-list");
    const getSelectedApproverLogins = () =>
      getSelectedMultiSelectValues("approver-list");
    const getSelectedIncludeLabelNames = () =>
      getSelectedMultiSelectValues("label-list");
    const getSelectedExcludeLabelNames = () =>
      getSelectedMultiSelectValues("exclude-label-list");

    // Phase 6 (see REACT_MIGRATION_PLAN.md): each of these six "Any
    // (with/without)" filters prefers its migrated value via
    // getFilterStateValueSafe (Context key, not DOM id) over the DOM read,
    // same handled/fallback shape as every other bridge in this
    // migration.
    const readFilterStateOrDomValue = (contextKey, domId) => {
      const override = getFilterStateValueSafe(contextKey);
      if (typeof override === "string") {
        return override.trim();
      }
      const doc = getDocument();
      const element = doc?.getElementById(domId);
      return String(element?.value || "").trim();
    };

    const getCustomCommentsFilter = () =>
      readFilterStateOrDomValue("filterCustomComments", "filter-custom-comments");
    const getOtherNotesFilter = () =>
      readFilterStateOrDomValue("filterOtherNotes", "filter-other-notes");
    const getPrDifficultyFilter = () =>
      readFilterStateOrDomValue("filterPrDifficulty", "filter-pr-difficulty");
    const getRallyStoriesFilter = () =>
      readFilterStateOrDomValue("filterRallyStories", "filter-rally-stories");
    const getRallyLinksFilter = () =>
      readFilterStateOrDomValue("filterRallyLinks", "filter-rally-links");
    const getAnalysisOfPrFilter = () =>
      readFilterStateOrDomValue("filterAnalysisOfPr", "filter-analysis-of-pr");

    const updateMultiSelectSummary = (listId) => {
      const list = getListElement(listId);
      if (!list) return;

      const detailsElement = list.closest("details");
      if (!detailsElement || typeof detailsElement.querySelector !== "function") {
        return;
      }

      const checkedCount = list.querySelectorAll("input[type='checkbox']:checked").length;
      const summary = detailsElement.querySelector(".multi-select-summary");
      if (!summary) return;

      const baseText = String(summary.textContent || "").split("(")[0].trim();
      summary.textContent =
        checkedCount > 0 ? `${baseText} (${checkedCount} selected)` : baseText;
    };

    const collectSortedLabelOptions = (entries, repoFilter = "") => {
      const labelsByToken = new Map();

      entries.forEach((entry) => {
        if (repoFilter && entry?.repo !== repoFilter) return;
        extractRowLabelNamesForEntry(entry).forEach((labelName) => {
          const normalizedToken = normalizeFilterTokenSafe(labelName);
          if (!normalizedToken || labelsByToken.has(normalizedToken)) return;
          labelsByToken.set(normalizedToken, labelName);
        });
      });

      return Array.from(labelsByToken.entries())
        .map(([normalizedToken, labelName]) => ({ normalizedToken, labelName }))
        .sort((a, b) =>
          String(a.labelName || "")
            .toLowerCase()
            .localeCompare(String(b.labelName || "").toLowerCase()),
        );
    };

    const populateIncludeLabelOptions = (entries, repoFilter = "") => {
      const labelList = getListElement("label-list");
      if (!labelList) return;

      const existingSelections = getSelectedIncludeLabelNames();
      const pendingSelections = getPendingLabelFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedTokens = new Set(
        seedSelections.map((value) => normalizeFilterTokenSafe(value)),
      );

      const sortedLabels = collectSortedLabelOptions(entries, repoFilter);

      if (sortedLabels.length === 0) {
        labelList.classList.add("empty");
      } else {
        labelList.classList.remove("empty");
      }

      renderMultiSelectListSafe(
        "label-list",
        sortedLabels.map(({ normalizedToken, labelName }) => ({
          value: labelName,
          label: labelName,
          checked: selectedTokens.has(normalizedToken),
        })),
      );

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedLabels.filter(({ normalizedToken }) =>
          selectedTokens.has(normalizedToken),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingLabelFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("label-list");
    };

    const populateExcludeLabelOptions = (entries, repoFilter = "") => {
      const excludeLabelList = getListElement("exclude-label-list");
      if (!excludeLabelList) return;

      const existingSelections = getSelectedExcludeLabelNames();
      const pendingSelections = getPendingExcludeLabelFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedTokens = new Set(
        seedSelections.map((value) => normalizeFilterTokenSafe(value)),
      );

      const sortedLabels = collectSortedLabelOptions(entries, repoFilter);

      if (sortedLabels.length === 0) {
        excludeLabelList.classList.add("empty");
      } else {
        excludeLabelList.classList.remove("empty");
      }

      renderMultiSelectListSafe(
        "exclude-label-list",
        sortedLabels.map(({ normalizedToken, labelName }) => ({
          value: labelName,
          label: labelName,
          checked: selectedTokens.has(normalizedToken),
        })),
      );

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedLabels.filter(({ normalizedToken }) =>
          selectedTokens.has(normalizedToken),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingExcludeLabelFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("exclude-label-list");
    };

    const populateAuthorOptions = (entries, repoFilter = "", actorsMap = {}) => {
      const authorList = getListElement("author-list");
      if (!authorList) return;

      const existingSelections = getSelectedAuthorLogins();
      const pendingSelections = getPendingAuthorFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedLogins = new Set(seedSelections);
      const authors = new Map();

      for (const entry of entries) {
        if (repoFilter && entry?.repo !== repoFilter) continue;

        const row = entry?.data || {};
        const login = getPreferredActorKeySafe(row.authorLogin, row.author);
        const displayName = String(row.author || "").trim();
        if (!login) continue;
        if (!authors.has(login)) {
          authors.set(login, resolveActorDisplayNameSafe(login, actorsMap, displayName));
        }
      }

      const sortedAuthors = Array.from(authors.entries()).sort((a, b) => {
        const textA = String(a[1] || a[0]).toLowerCase();
        const textB = String(b[1] || b[0]).toLowerCase();
        return textA.localeCompare(textB);
      });

      if (sortedAuthors.length === 0) {
        authorList.classList.add("empty");
      } else {
        authorList.classList.remove("empty");
      }

      renderMultiSelectListSafe(
        "author-list",
        sortedAuthors.map(([login, displayName]) => ({
          value: login,
          label: displayName,
          checked: selectedLogins.has(login),
        })),
      );

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedAuthors.filter(([login]) =>
          selectedLogins.has(login),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingAuthorFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("author-list");
    };

    const populateAssignedOptions = (entries, repoFilter = "", actorsMap = {}) => {
      const assignedList = getListElement("assigned-list");
      if (!assignedList) return;

      const existingSelections = getSelectedAssignedLogins();
      const pendingSelections = getPendingAssignedFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedLogins = new Set(seedSelections);
      const assignees = new Map();

      for (const entry of entries) {
        if (repoFilter && entry?.repo !== repoFilter) continue;

        const rowAssignees = collectAssignedUsersForEntry(entry);
        rowAssignees.forEach((assignee) => {
          const login = String(assignee?.login || "").trim();
          if (!login) return;
          if (!assignees.has(login)) {
            assignees.set(
              login,
              resolveActorDisplayNameSafe(login, actorsMap, assignee?.name),
            );
          }
        });
      }

      const sortedAssignees = Array.from(assignees.entries()).sort((a, b) => {
        const textA = String(a[1] || a[0]).toLowerCase();
        const textB = String(b[1] || b[0]).toLowerCase();
        return textA.localeCompare(textB);
      });

      if (sortedAssignees.length === 0) {
        assignedList.classList.add("empty");
      } else {
        assignedList.classList.remove("empty");
      }

      renderMultiSelectListSafe(
        "assigned-list",
        sortedAssignees.map(([login, displayName]) => ({
          value: login,
          label: displayName,
          checked: selectedLogins.has(login),
        })),
      );

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedAssignees.filter(([login]) =>
          selectedLogins.has(login),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingAssignedFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("assigned-list");
    };

    const populateApproverOptions = (entries, repoFilter = "", actorsMap = {}) => {
      const approverList = getListElement("approver-list");
      if (!approverList) return;

      const existingSelections = getSelectedApproverLogins();
      const pendingSelections = getPendingApproverFilterSelectionsSafe();
      const seedSelections =
        existingSelections.length > 0
          ? existingSelections
          : Array.isArray(pendingSelections)
            ? pendingSelections
            : [];
      const selectedLogins = new Set(seedSelections);
      const approvers = new Map();

      for (const entry of entries) {
        if (repoFilter && entry?.repo !== repoFilter) continue;

        collectApproversForEntry(entry).forEach((approver) => {
          const login = String(approver?.login || "").trim();
          if (!login) return;
          if (!approvers.has(login)) {
            approvers.set(
              login,
              resolveActorDisplayNameSafe(login, actorsMap, approver?.name),
            );
          }
        });
      }

      const sortedApprovers = Array.from(approvers.entries()).sort((a, b) => {
        const textA = String(a[1] || a[0]).toLowerCase();
        const textB = String(b[1] || b[0]).toLowerCase();
        return textA.localeCompare(textB);
      });

      if (sortedApprovers.length === 0) {
        approverList.classList.add("empty");
      } else {
        approverList.classList.remove("empty");
      }

      renderMultiSelectListSafe(
        "approver-list",
        sortedApprovers.map(([login, displayName]) => ({
          value: login,
          label: displayName,
          checked: selectedLogins.has(login),
        })),
      );

      if (Array.isArray(pendingSelections)) {
        const appliedCount = sortedApprovers.filter(([login]) =>
          selectedLogins.has(login),
        ).length;
        if (appliedCount > 0 || existingSelections.length > 0) {
          setPendingApproverFilterSelectionsSafe(null);
        }
      }

      updateMultiSelectSummary("approver-list");
    };

    const renderManagementFilterSummary = ({
      summaryText = "",
      filterChips = [],
    } = {}) => {
      renderFilterSummarySafe(summaryText, filterChips);
    };

    const setupMultiSelectDropdownClosing = () => {
      const doc = getDocument();
      if (!doc || typeof doc.querySelectorAll !== "function") return;
      const dropdowns = doc.querySelectorAll(".multi-select-dropdown");
      if (dropdowns.length === 0) return;

      doc.addEventListener("click", (event) => {
        dropdowns.forEach((dropdown) => {
          if (!dropdown.contains(event.target)) {
            dropdown.open = false;
          }
        });
      });
    };

    return {
      getSelectedAuthorLogins,
      getSelectedAssignedLogins,
      getSelectedApproverLogins,
      getSelectedIncludeLabelNames,
      getSelectedExcludeLabelNames,
      getCustomCommentsFilter,
      getOtherNotesFilter,
      getPrDifficultyFilter,
      getRallyStoriesFilter,
      getRallyLinksFilter,
      getAnalysisOfPrFilter,
      updateMultiSelectSummary,
      populateIncludeLabelOptions,
      populateExcludeLabelOptions,
      populateAuthorOptions,
      populateAssignedOptions,
      populateApproverOptions,
      renderManagementFilterSummary,
      setupMultiSelectDropdownClosing,
    };
  };

  return {
    createPrFilterPanelHelpers,
  };
});
