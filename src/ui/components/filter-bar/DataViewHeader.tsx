import { usePrData } from '../../state/PrDataContext';
import { useFilteredPrRows } from '../../state/useVisiblePrNumbers';
import { usePrTableOpenSections } from '../../state/PrTableUiStateContext';
import { FilterBar } from './FilterBar';

/**
 * What sits above the PR table: the filter bar, with how many rows the
 * filters show (useFilteredPrRows - the table's own derivation) of every
 * stored row. Its chips say which filters apply; the header says when the
 * data was last updated, and Activity what's running.
 *
 * Mount inside the data Providers (PrDataProvider, FilterOptionsProvider,
 * the selection Providers). The count waits for the first real data load:
 * before it, the empty seed payload would give a real-looking "0 of 0".
 */
export function DataViewHeader() {
  const { payload } = usePrData();
  const { visiblePrKeys, totalCount } = useFilteredPrRows();
  const { hiddenPrCount } = usePrTableOpenSections();
  const loaded = Boolean(payload?.ok);
  return (
    <div id="filter-bar-root">
      <FilterBar shownCount={visiblePrKeys.length} totalCount={totalCount} loaded={loaded} hiddenCount={hiddenPrCount} />
    </div>
  );
}
