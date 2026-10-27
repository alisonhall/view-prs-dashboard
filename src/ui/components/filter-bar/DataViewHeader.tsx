import { usePrData } from '../../state/PrDataContext';
import { useAppliedFilterSummary } from '../../state/useAppliedFilterSummary';
import { usePrTableOpenSections } from '../../state/PrTableUiStateContext';
import { FilterBar } from './FilterBar';

/**
 * What sits above the PR table: the PR data summary (#data-meta) and the
 * filter bar, from one useAppliedFilterSummary() call - each call runs the
 * whole row-filtering derivation again, so they share it.
 *
 * Mount inside the data Providers (PrDataProvider, FilterOptionsProvider,
 * the selection Providers, JobEventsProvider). The summary says
 * "Loading..." until the first real data load: before it, the empty seed
 * payload would give a real-looking "Rows: 0".
 */
export function DataViewHeader() {
  const { payload } = usePrData();
  const { summaryText, shownCount, totalCount } = useAppliedFilterSummary();
  const { hiddenPrCount } = usePrTableOpenSections();
  const loaded = Boolean(payload?.ok);
  return (
    <>
      <pre id="data-meta" style={{ whiteSpace: 'break-spaces' }} role="region" aria-label="PR data summary">
        {loaded ? summaryText : 'Loading...'}
      </pre>
      <div id="filter-bar-root">
        <FilterBar shownCount={shownCount} totalCount={totalCount} loaded={loaded} hiddenCount={hiddenPrCount} />
      </div>
    </>
  );
}
