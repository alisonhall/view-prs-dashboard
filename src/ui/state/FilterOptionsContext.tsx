import { createContext, useContext } from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptionsValue {
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
 * The option lists of the 9 multi-select filter lists (not the checked
 * selections, which MultiSelectCheckboxList keeps in its own state),
 * derived from PrDataContext's payload by FilterOptionsProvider.tsx.
 *
 * Default value (all empty arrays): a component rendered without a
 * <FilterOptionsProvider> ancestor still renders, with empty lists.
 */
export const FilterOptionsContext = createContext<FilterOptionsValue>(EMPTY_OPTIONS);

export function useFilterOptions(): FilterOptionsValue {
  return useContext(FilterOptionsContext);
}
