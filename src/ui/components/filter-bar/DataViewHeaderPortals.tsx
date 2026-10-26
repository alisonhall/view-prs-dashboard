import { createPortal } from 'react-dom';
import { usePrData } from '../../state/PrDataContext';
import { useAppliedFilterSummary } from '../../state/useAppliedFilterSummary';
import { FilterBar } from './FilterBar';

/**
 * What sits above the PR table: the filter bar and the PR data summary
 * (#data-meta), from one useAppliedFilterSummary() call - each call runs
 * the whole row-filtering derivation again, so they share it.
 *
 * Mount inside the data Providers (PrDataProvider, FilterOptionsProvider,
 * the selection Providers, JobEventsProvider). The summary says
 * "Loading..." until the first real data load: before it, the empty seed
 * payload would give a real-looking "Rows: 0".
 */
export interface DataViewHeaderPortalsProps {
  filterBarContainer: Element | null;
  dataMetaContainer: Element | null;
}

export function DataViewHeaderPortals({ filterBarContainer, dataMetaContainer }: DataViewHeaderPortalsProps) {
  const { payload } = usePrData();
  const { summaryText, shownCount, totalCount } = useAppliedFilterSummary();
  const loaded = Boolean(payload?.ok);
  return (
    <>
      {filterBarContainer &&
        createPortal(<FilterBar shownCount={shownCount} totalCount={totalCount} loaded={loaded} />, filterBarContainer, 'filter-bar')}
      {dataMetaContainer && createPortal(loaded ? summaryText : 'Loading...', dataMetaContainer, 'data-meta')}
    </>
  );
}
