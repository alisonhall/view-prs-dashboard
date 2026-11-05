import { createContext, useContext } from 'react';

/**
 * The search box's words, as the table applies them (debounced; PrTableApp
 * provides it): a row whose match was only in what it doesn't show - its
 * branch names or notes - says where (PrTitleCell). None outside a
 * provider.
 */
const NO_TERMS: string[] = [];

export const SearchTermsContext = createContext<string[]>(NO_TERMS);

export const useSearchTerms = () => useContext(SearchTermsContext);
