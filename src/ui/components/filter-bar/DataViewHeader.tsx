import { useMemo } from 'react';
import { archivedEntryKeys, splitArchivedCount } from '../../helpers/pr-archive.helpers.ts';
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
 * Archived rows the table has (a search, Show older) are counted apart, so
 * the total stays the rows the page always has.
 */
export function DataViewHeader() {
  const { payload } = usePrData();
  const { visiblePrKeys, totalCount } = useFilteredPrRows();
  const { hiddenPrCount } = usePrTableOpenSections();
  const loaded = Boolean(payload?.ok);
  const archivedKeys = useMemo(() => archivedEntryKeys(payload), [payload]);
  const counts = splitArchivedCount(visiblePrKeys, totalCount, archivedKeys);
  return (
    <div id="filter-bar-root">
      <FilterBar
        shownCount={counts.shown}
        totalCount={counts.total}
        archivedCount={counts.archivedShown}
        loaded={loaded}
        hiddenCount={hiddenPrCount}
      />
    </div>
  );
}
