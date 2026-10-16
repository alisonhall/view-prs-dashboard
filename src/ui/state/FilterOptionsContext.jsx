import { createContext, useContext } from 'react';

const EMPTY_OPTIONS = {
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
 * Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 9 multi-select
 * filter lists' OPTION lists (not the user's checked selections, which stay
 * owned by MultiSelectCheckboxList's own local state) - derived from
 * PrDataContext's payload by FilterOptionsProvider.jsx, replacing the
 * vanilla populateXOptions functions (pr-filter-panel.helpers.js,
 * index.page.js) that used to compute these and push them into React via
 * the imperative window.renderReactMultiSelectList bridge.
 *
 * Default value (all empty arrays) matches every other Context cluster in
 * this migration - a component rendered without a <FilterOptionsProvider>
 * ancestor still renders correctly with empty lists, no wrapping required.
 */
export const FilterOptionsContext = createContext(EMPTY_OPTIONS);

export function useFilterOptions() {
  return useContext(FilterOptionsContext);
}
