import { asArray } from "./pr-as-array.helpers.ts";

// The selected row filters as both lists and the comma-joined text the
// applied-filters summary shows.
export interface SelectedFiltersInput {
  selectedIncludeLabelNames?: string[] | null;
  selectedExcludeLabelNames?: string[] | null;
  selectedAuthorLogins?: string[] | null;
  selectedAssignedLogins?: string[] | null;
  selectedApproverLogins?: string[] | null;
  openModeFilter?: string | null;
  alwaysShowInReview?: unknown;
}

export interface SelectedFiltersViewModel {
  selectedIncludeLabelNames: string[];
  selectedExcludeLabelNames: string[];
  selectedAuthorLogins: string[];
  selectedAssignedLogins: string[];
  selectedApproverLogins: string[];
  includeLabelFilter: string;
  excludeLabelFilter: string;
  authorFilter: string;
  assignedFilter: string;
  approverFilter: string;
  includeLabels: string[];
  excludeLabels: string[];
  openModeFilter: string;
  alwaysShowInReview: boolean;
}

const createPrSelectedFiltersHelpers = () => {
  const buildSelectedFiltersViewModel = ({
    selectedIncludeLabelNames,
    selectedExcludeLabelNames,
    selectedAuthorLogins,
    selectedAssignedLogins,
    selectedApproverLogins,
    openModeFilter,
    alwaysShowInReview,
  }: SelectedFiltersInput = {}): SelectedFiltersViewModel => {
    const includeLabelNames = asArray(selectedIncludeLabelNames);
    const excludeLabelNames = asArray(selectedExcludeLabelNames);
    const authorLogins = asArray(selectedAuthorLogins);
    const assignedLogins = asArray(selectedAssignedLogins);
    const approverLogins = asArray(selectedApproverLogins);

    return {
      selectedIncludeLabelNames: includeLabelNames,
      selectedExcludeLabelNames: excludeLabelNames,
      selectedAuthorLogins: authorLogins,
      selectedAssignedLogins: assignedLogins,
      selectedApproverLogins: approverLogins,
      includeLabelFilter: includeLabelNames.join(", "),
      excludeLabelFilter: excludeLabelNames.join(", "),
      authorFilter: authorLogins.join(", "),
      assignedFilter: assignedLogins.join(", "),
      approverFilter: approverLogins.join(", "),
      includeLabels: [...includeLabelNames],
      excludeLabels: [...excludeLabelNames],
      openModeFilter: openModeFilter || "none",
      alwaysShowInReview: Boolean(alwaysShowInReview),
    };
  };

  return {
    buildSelectedFiltersViewModel,
  };
};

export { createPrSelectedFiltersHelpers };
