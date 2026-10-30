import { usePrData, type PrDataValue } from '../state/PrDataContext';
import type { PrDataPayload } from '../types/pr-data.ts';

/**
 * Test helper: reads (and writes) PrDataProvider's state from a test.
 *
 * Window-bridge elimination, test-only bridges (see
 * WINDOW_BRIDGE_ELIMINATION_PLAN.md): tests used to push payloads and read
 * them back through `window.updateReactPrTable()`/`getReactPrTablePayload()`/
 * `getReactPrTableSelectedRepo()`/`updateReactSelectedAuthorLogin()` -
 * bridges PrDataProvider published with no production caller. They now mount
 * `<PrDataProbe />` inside the real `PrDataProvider` and use these, which go
 * through the same Context the components under test read. Same shape as
 * filter-state-probe.tsx.
 *
 *   const probe = createPrDataProbe();
 *   render(<PrDataProvider ...><probe.PrDataProbe /><Thing /></PrDataProvider>);
 *   act(() => probe.applyFreshTablePayload(nextPayload, 'owner/repo'));
 *   expect(probe.readPayload()).toBe(nextPayload);
 *
 * Reads return the probe's most recent render, i.e. what a `usePrData()`
 * consumer sees. Create one probe per test file (or per render) - it
 * remembers only the latest mounted instance.
 */
export function createPrDataProbe() {
  let latest: PrDataValue | null = null;

  function PrDataProbe() {
    latest = usePrData();
    return null;
  }

  const requireMounted = () => {
    if (!latest) {
      throw new Error('PrDataProbe is not mounted: render <probe.PrDataProbe /> inside the PrDataProvider');
    }
    return latest;
  };

  return {
    PrDataProbe,
    readPayload: () => requireMounted().payload,
    readSelectedRepo: () => requireMounted().selectedRepo,
    // Same merge semantics window.updateReactPrTable had: an undefined
    // payload or empty repo keeps the previous value.
    applyFreshTablePayload: (payload?: PrDataPayload, selectedRepo?: string) =>
      requireMounted().applyFreshTablePayload(payload, selectedRepo),
    setSelectedAuthorLogin: (login: string) => requireMounted().setSelectedAuthorLogin(login),
    reset: () => {
      latest = null;
    },
  };
}
