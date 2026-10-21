# Eliminate remaining window.* bridges: vanilla callers, perf-avoidance pattern, and test-only bridge

Policy: no bridge may be declared "structurally necessary" without proof. Bridges with a vanilla caller get that caller migrated; bridges kept to dodge a Context re-render get a real React pattern; the test-only bridge (`persistViewFilterOptionOverrides`) gets its tests fixed and is deleted.

## Context

1. `index.page.js` is a disciplined vanilla orchestrator. Its ~38 remaining bridge calls are each justified (DOM-mount seam, load-order race shim, or cross-boundary read), but only because it still owns orchestration (bootstrap, data-poll fingerprinting, backfill polling). The fix is to move that orchestration into React so the file and its bridges go away.
2. Several React components/hooks call `window.*` instead of the owning Provider's hook:
   - Some are same-tree swaps (Context already exposes the value).
   - Some bridges are owned by `AppRoot`'s local state (`updateReactBackfillButtonState`, `updateReactAutoRenderBlockedLinks`): fix by prop-threading.
   - `useRunScript`, `useSinglePrUpdate`, and partly `useAckLabelActions`/`useRowCheckboxActions`/`useRequestMoreMerged` run in `AppRoot`'s body, outside `PrDataProvider` (rendered inside `AppRoot`'s JSX). They need `PrDataProvider` moved to wrap from `mountAppRoot()`.
   - `PrDataProvider`'s reads of `AutoRenderBlockingContext` go the wrong direction (it is an ancestor, not a descendant). The same root-wrap fixes this.
   - `updateReactPrTable`/`PrTableApp.jsx` is already migrated: nothing to do.
   - Backfill getters/setters and the `getLatestStoredPayload`/`applyLatestPrData`/`loadStoredData`/`summarizeAckRefreshWarnings`/`renderSchedulerStatus` group have no Context equivalent yet: Phase 4 / Phase 7.
3. `PrSelectionCell.jsx`'s `getFilterStateValues`/`setFilterStateValue` bridge exists because `FilterStateContext`'s single un-memoized `values` object re-renders every row on any keystroke. Real answer: per-key external store + `useSyncExternalStore`.
4. `persistViewFilterOptionOverrides` has zero production callers; 11 call sites in `index.html.test.js` use it to bypass the real 150ms debounce. Fake timers remove the need.

## Phases

### Phase 1 - True no-restructure hook swaps
- `JobEventsProvider.jsx`: use the already-destructured `pollForDataChanges` from `useContext(PrDataContext)` instead of `window.pollForDataChanges?.()`.
- `useBackfillActions.jsx`: use `useBackfillStatus()`'s `isBackfillRunning`/`supportsBackfillLogPolling`/`setSupportsBackfillLogPolling`/`setIsBackfillActionPending` instead of `window.getBackfillTrackingState()` and the setters.
- `NotesSection.jsx`: use `usePrData().beginRequestActivity`.

### Phase 2 - Wrap `PrDataProvider` and `AutoRenderBlockingProvider` from `mountAppRoot()`
`AutoRenderBlockingProvider` wraps `PrDataProvider`; both wrap `<AppRoot/>`. Verify neither relies on a Context rendered between them inside `AppRoot`'s JSX (`FilterStateProvider`, `RowFilterSelectionProvider`, ...). Full eslint+jest+Playwright for this move alone.

### Phase 3 - Hook swaps unlocked by Phase 2
- `useRunScript`, `useSinglePrUpdate`, `useAckLabelActions`, `useRowCheckboxActions`, `useRequestMoreMerged` -> `usePrData()`.
- `PrDataProvider`'s auto-render-blocking reads -> `useAutoRenderBlocking()`.
- Thread `AppRoot`-owned setters (`updateReactBackfillButtonState`, `updateReactAutoRenderBlockedLinks` targets) as explicit parameters.

### Phase 4 - Extend `BackfillStatusProvider`'s Context
Export `getBackfillTrackingState`/`updateBackfillStatusFromPayload`/`setBackfillLogMessage`/`renderBackfillStatus`; finish `useBackfillActions`; keep `BackfillLogControls` consistent.

Update `useMemo`/`useCallback` deps wherever a hook value replaces a stable `window.*` reference. Full eslint+jest+Playwright after each phase; one `REACT_MIGRATION_PLAN.md` entry + commit per logical group.

### Phase 5 - `PrSelectionCell` perf bridge -> `useSyncExternalStore`
Per-Provider-instance store (`subscribe(key, l)` / `getSnapshot(key)` / `setValue(key, v)`), `useFilterField(key)` hook. `PrSelectionCell` uses `useFilterField('prNumbersInput')`; drop the `defaultChecked` hack. Other `useFilterState()` consumers untouched. Delete `window.getFilterStateValues`/`setFilterStateValue` after grep confirms no callers.

### Phase 6 - Fix `persistViewFilterOptionOverrides` tests, then delete it
In `index.html.test.js`, scope `jest.useFakeTimers()` to each of the 11 tests and replace `await window.persistViewFilterOptionOverrides(...)` with `act(() => jest.advanceTimersByTime(150))`. Confirm PUT-body assertions still pass, then delete the bridge and its header-comment line from `FilterStateProvider.jsx`.

### Phase 7 - Migrate `index.page.js` orchestration into React
One responsibility at a time, each with full eslint+jest+Playwright and a `REACT_MIGRATION_PLAN.md` entry:
- Data-poll pipeline (manifest/delta/fingerprint/`getDataPollRenderAction`/`renderPrData`/`loadStoredData`) -> `usePrDataBootstrap()`-style hook in `PrDataProvider`; `AppRoot` always renders the table. (First.)
- Backfill status bootstrap -> `BackfillStatusProvider` mount effect; delete race-shim forwarders.
- Scheduler/request-activity CustomEvent dispatch -> `PrDataProvider` effect.
- Status text, notes-dirty, auto-render-blocking, author-insights-drafts -> pure React reads; delete bridges.
- End state: `index.page.js` is at most the entry calling `mountAppRoot()`, or deleted.

## Verification (per phase)
- `npx eslint .` clean.
- Full `npx jest` green; reconcile added/removed test counts.
- Full `npx playwright test` green; add e2e coverage where a removal changes observable behavior.
- `REACT_MIGRATION_PLAN.md` entry + commit per logical group.

## Status

- **Phase 1** done (`6a910e5`). **Phase 2** done (`1db3f35`).
- **Phase 3** done as 3a-3d (see `REACT_MIGRATION_PLAN.md`). Two deviations from the text above, both because investigating showed the plan's wording didn't fit:
  - `AutoRenderBlockingContext` had no getters to call, so they were added to it first (3a).
  - Output text and backfill button state got Provider-owned Context state instead of "explicit parameters from `AppRoot`", since `useSinglePrUpdate` (in `PrTableApp`) and `BackfillStatusProvider` (an ancestor) can't receive parameters from `AppRoot` (3c, 3d).
- Phases 4-7 not started. Phase 4's remaining scope shrinks: `getBackfillTrackingState` and the button state are already on `BackfillStatusContext`.
