import { createContext, useContext } from 'react';

export interface FilterOption {
  value: string;
  label: string;
  // Its group in the list, if the list has groups (MultiSelectDropdown).
  group?: string;
}

export interface FilterOptionsValue {
  // Every stored row's repo, whichever repo is selected.
  repoOptions: FilterOption[];
  labelOptions: FilterOption[];
  excludeLabelOptions: FilterOption[];
  authorOptions: FilterOption[];
  assignedOptions: FilterOption[];
  approverOptions: FilterOption[];
  authorThreadResolutionAllowOptions: FilterOption[];
  authorThreadResolutionDenyOptions: FilterOption[];
  changeFilterIgnoreCommentAuthorsOptions: FilterOption[];
  changeFilterIgnoreReviewAuthorsOptions: FilterOption[];
}

const EMPTY_OPTIONS: FilterOptionsValue = {
  repoOptions: [],
  labelOptions: [],
  excludeLabelOptions: [],
  authorOptions: [],
  assignedOptions: [],
  approverOptions: [],
  authorThreadResolutionAllowOptions: [],
  authorThreadResolutionDenyOptions: [],
  changeFilterIgnoreCommentAuthorsOptions: [],
  changeFilterIgnoreReviewAuthorsOptions: [],
};

/**
 * The option lists of the 10 multi-select lists (not the checked
 * selections, which their selection Contexts hold),
 * derived from PrDataContext's payload by FilterOptionsProvider.tsx.
 *
 * Default value (all empty arrays): a component rendered without a
 * <FilterOptionsProvider> ancestor still renders, with empty lists.
 */
export const FilterOptionsContext = createContext<FilterOptionsValue>(EMPTY_OPTIONS);

export function useFilterOptions(): FilterOptionsValue {
  return useContext(FilterOptionsContext);
}
