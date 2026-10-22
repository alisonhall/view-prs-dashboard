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

## Status (last updated 2026-10-21, after Phase 7.1)

Branch `development`. Phases 1-6 pushed through `7f2bbfe`; CI (lint, ubuntu, **windows**, e2e) green at that commit. Phase 7.1 is committed locally and **not pushed**, so CI hasn't run on it yet (local run on Windows: lint, `test:ci`, `test:e2e` all pass).

### Done
| Phase | Commits | Notes |
|---|---|---|
| 1 | `6a910e5` | JobEventsProvider / useBackfillActions / NotesSection swaps |
| 2 | `1db3f35` | `AutoRenderBlockingProvider` > `PrDataProvider` now wrap `<AppRoot/>` from `mountAppRoot()` |
| 3a-3d | `fcea8f7` `85b75ca` `a5c6156` `65167ba` | ARB actions Context; 6 hooks -> request activity; `OutputTextProvider`; backfill button state |
| 3 review | `ade5377` | three render-cascade regressions fixed (see "Lessons") |
| 4 | `1aff624`, `964ffcd` | `BackfillStatusProvider` owns all status state; `BackfillStatusActionsContext`; refetch-loop guards |
| 5a / 5b | `fe67837` `3f8fd59`, review fix `f09b2f2` | per-key `useSyncExternalStore` store; `window.getFilterStateValues`/`setFilterStateValue` deleted |
| CI fixes | `03dadc1`, `cd077b6` | not part of the plan: the `PATH`-first dependency check must never run on win32 |
| 6 | `7f2bbfe` | `window.persistViewFilterOptionOverrides` deleted. jsdom tests wait for the real debounce with **real** timers (fake timers didn't fit; see `REACT_MIGRATION_PLAN.md`). e2e `waitForFilterPersist` (38 call sites, missed by the plan) rewritten as a request-settle wait. |
| 7.1 | the "Phase 7.1" commit after `7f2bbfe` | Data pipeline (`loadStoredData`/`renderPrData`/`applyFreshPrPayload`/`applyLatestPrData`/fingerprint helpers + the initial load) moved into `PrDataProvider` (`PrDataActionsContext`, `loadOnMount`); 15 bridges deleted incl. `mountReactPrTable`/`pollForDataChanges`. Integration harness's `PrDataProvider` hoisted to its root; `WindowBackedPrActivityProvider` gone. `index.page.js` 2100 -> 1603 lines. |

Deviations from the plan text (each because investigation showed the wording didn't fit) are in `REACT_MIGRATION_PLAN.md`'s entries for each phase.

### Next: Phase 7.2 onward - the rest of `index.page.js`'s orchestration (one responsibility at a time)
Re-grep before starting (`grep -rn "window\.<name>" src/ui | grep -v test`). As of Phase 7.1 the bridges that remain **only because `index.page.js` (vanilla) still calls them** are:
- request activity: `beginRequestActivity`, `renderRequestActivity` (also used by `PrDataProvider`'s own poll closure (`setStatusMessage`), `BackfillStatusProvider`, `AutoRenderBlockingProvider`, which sit outside `PrDataProvider` or can't use `useRequestActivity()` there)
- `updateReactOutputText` (OutputTextProvider), `updateReactBackfillButtonState`, `updateReactBackfillLogText`, `getBackfillTrackingState`, `setSupportsBackfillLogPolling`, `setIsBackfillActionPending`, `updateBackfillStatusFromPayload`, `setBackfillLogMessage`, `renderBackfillStatus` (all BackfillStatusProvider; fed by `index.page.js`'s `loadBackfillStatus` instance and its initial-load call)
- `pushAutoRenderBlockingState` (AutoRenderBlockingProvider); `updateReactAutoRenderBlockedLinks` (AppRoot; only caller is `pr-auto-render-indicator-links.helpers.js`, called from vanilla); `getReactPrTablePayload` (read by `index.page.js`'s auto-render-blocking display-name/alias helpers)
- owned by `index.page.js` and called from React: `renderSchedulerStatus` (JobEventsProvider's SSE path), `loadBackfillStatus` (PrDataProvider's `pollBackfillStatus`), `setStatusMessage`
- **Test-only now (no production caller; fix the tests, then delete, as Phase 6 did):** `setPendingAutoRenderPayload` (its last vanilla caller moved with `applyFreshPrPayload`; `AutoRenderBlockingProvider.test.jsx` and e2e `smoke.spec.js`'s "Auto update paused" chip test use it to simulate a deferred poll, since the e2e server's static data never yields a real new payload), `getReactPrTableSelectedRepo` (only tests read it), `updateReactPrTable` (production writer gone with `updateReactTable`; ~10 test files use it to push a payload).
- Suggested order: backfill status bootstrap (`loadBackfillStatus` + initial load + race-shim forwarders) next, then scheduler/request-activity events, then the pure-React reads. Each: full lint + `test:ci` + `test:e2e`, a `REACT_MIGRATION_PLAN.md` entry, a commit.
- When `index.page.js` goes, also delete: the `viewprs:react-ready` replay listeners; the e2e test that writes through `window.updateReactOutputText`. (The harness's `WindowBackedPrActivityProvider`/`PrDataProvider` hoist, originally listed here, was done in 7.1.)

### Lessons from Phases 1-7.1 (apply to every remaining phase)
1. **A component that only needs stable functions from a changing Provider must read them from a separate, stable Context.** `PrDataProvider` wraps the whole table tree and its `value` object is not memoized, so subscribing it (or anything high up) to a Context that changes re-renders every `usePrData()` consumer. Done so far: `AutoRenderBlockingActionsContext`, `OutputTextSetterContext`, `RequestActivityContext`, `BackfillStatusActionsContext`, `FilterFieldStoreContext`. Measure with a `React.memo` consumer's render count before and after; add a regression test.
2. **`useBackfillActions()`'s result identity must stay stable** (guards in `useBackfillActions.test.jsx` and an e2e request-count test): `useBackfillTabAutoRefresh` refetches whenever `triggerBackfillTabLoad` changes, so one unstable dependency in the provider chain is a request loop (498 requests/3 s measured). Every function a Provider publishes must be a `useCallback` over refs/setters.
3. **Windows**: never trust a file on `PATH` there (WSL's `System32\bash.exe` stub); POSIX-only assertions (executable bit) must be skipped on win32; `isCommandAvailable` must tolerate non-string input.
4. For every new regression test, **break the code and watch the test fail**, then restore (use `cat saved > file`, not `cp`: `cp` is aliased to prompt here and silently refused to restore once).
5. Run the **exact CI commands** before committing: `npm run lint:check`, `npm run test:ci` (serial + coverage + state guards; it caught a bug bare `jest` missed), `npm run test:e2e`. Use Node 22.22.0: `export PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH` (the default shell had Node 16; Homebrew's Node is 22.1, below the required `>=22.22.0`).
6. The integration harness (`src/ui/integration-tests/index.html.test.js`) mounts providers as it likes; when a production Provider starts reading another Context, check the harness nests them the same way, or the feature silently goes inert there (hit this with `AutoRenderBlockingProvider` and `PrDataProvider`).
7. **When moving vanilla bootstrap work (a fetch on page load) into a Provider, make it opt-in** (a prop `mountAppRoot()` sets, like `PrDataProvider`'s `loadOnMount`): many component tests mount that Provider with their own initial state, and an unconditional mount-time fetch would overwrite it with whatever their fetch mock returns. The integration harness then has to mount that Provider at its root, after `fetch` is mocked.

### Known, unrelated, left alone
- `src/server/integration-tests/app.events-routes.test.js` heartbeat test (50 ms interval, fixed 100 ms wait) flaked once under full-suite load.
- `PrDataProvider`'s `value` object is not memoized (pre-existing amplifier for lesson 1).
- `view-prs.code-workspace` has an uncommitted user change (a Peacock `statusBar.inactiveBackground` colour) - not part of this work; don't commit it unasked.
- The dotfiles repo (`/Users/alihall/Sites/Personal/dotfiles`) has two local commits for the `PATH` fix (`c3a663e`, `7689e5e`, not pushed) and other uncommitted changes of the user's.
- Policy: don't push without asking; confirm before anything outward-facing.
