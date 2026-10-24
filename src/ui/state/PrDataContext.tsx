import { createContext, useContext } from 'react';
import type { PrDataPayload } from '../types/pr-data.ts';
import type { StatsViewState } from '../helpers/pr-review-stats-aggregation.helpers.ts';

/**
 * The PR table's data: the /view-prs/data payload, which repo it's for,
 * the Review Statistics view settings and the selected Author Insights
 * author, plus the actions that change them and the data polls. Owned by
 * <PrDataProvider />, which also provides PrDataActionsContext and
 * ActorIdentityContext.
 */
export interface ReviewStatsViewState extends StatsViewState {
  // The date filter inputs ("YYYY-MM-DD", or "" when unset).
  startDate?: string;
  endDate?: string;
}

export interface PrDataState {
  payload: PrDataPayload;
  selectedRepo: string;
  selectedAuthorLogin: string;
  statsViewState: ReviewStatsViewState;
  // False until the first payload has been put on screen.
  hasRenderedPrData: boolean;
}

export interface PrDataValue extends PrDataState {
  setPayload: (payload: PrDataPayload) => void;
  // An undefined payload or empty repo keeps the current one.
  applyFreshTablePayload: (payload?: PrDataPayload, selectedRepo?: string) => void;
  // Merged into the current settings.
  setStatsViewState: (patch: Partial<ReviewStatsViewState>) => void;
  setSelectedAuthorLogin: (login: string) => void;
  pollForDataChanges: () => Promise<void>;
  pollBackfillStatus: () => Promise<void>;
}

export const PrDataContext = createContext<PrDataValue | null>(null);

export function usePrData(): PrDataValue {
  const context = useContext(PrDataContext);
  if (!context) {
    throw new Error('usePrData() must be called within a <PrDataProvider>');
  }
  return context;
}
