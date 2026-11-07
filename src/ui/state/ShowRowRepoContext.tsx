import { createContext, useContext } from 'react';

/**
 * Whether rows from more than one repo are in view (PrTableApp provides
 * it): then each row says which repo its PR is in (PrTitleCell), as the
 * number alone doesn't. False outside a provider.
 */
export const ShowRowRepoContext = createContext(false);

export const useShowRowRepo = () => useContext(ShowRowRepoContext);
