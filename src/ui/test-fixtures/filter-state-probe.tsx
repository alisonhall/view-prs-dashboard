import { useFilterState, type FilterStateValue } from '../state/FilterStateContext';

/**
 * Test helper: reads (and writes) FilterStateProvider's state from a test.
 *
 * Window-bridge elimination Phase 5b (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * tests used to assert on, and seed, that state through
 * `window.getFilterStateValues()`/`window.setFilterStateValue()` - bridges with
 * no production caller. They now mount `<FilterStateProbe />` inside the real
 * `FilterStateProvider` and use these, which go through the same Context the
 * components under test read.
 *
 *   const probe = createFilterStateProbe();
 *   render(<FilterStateProvider ...><probe.FilterStateProbe /><Thing /></FilterStateProvider>);
 *   expect(probe.readValues().scopeMode).toBe('last-run');
 *   act(() => probe.setValue('scopeMode', 'all'));
 *
 * `readValues()` is the `values` of the probe's most recent render, i.e. what a
 * `useFilterState()` consumer sees. Create one probe per test file (or per
 * render) - it remembers only the latest mounted instance.
 */
export function createFilterStateProbe() {
  let latest: FilterStateValue | null = null;

  function FilterStateProbe() {
    latest = useFilterState();
    return null;
  }

  const requireMounted = () => {
    if (!latest) {
      throw new Error('FilterStateProbe is not mounted: render <probe.FilterStateProbe /> inside the FilterStateProvider');
    }
    return latest;
  };

  return {
    FilterStateProbe,
    readValues: () => requireMounted().values,
    setValue: (key: string, value: unknown) => requireMounted().setValue(key, value),
  };
}
