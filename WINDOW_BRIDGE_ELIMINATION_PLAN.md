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

## Status (last updated 2026-10-22, after Phase 7.5)

Branch `development`. Phases 1-6 pushed through `7f2bbfe`; CI (lint, ubuntu, **windows**, e2e) green at that commit. Phases 7.1-7.4 and their follow-ups are pushed through `cb3bead` (local run on Windows before each push: lint, `test:ci`, `test:e2e` all pass); CI hasn't been checked on them yet. Phase 7.5 is committed locally and **not pushed**. Between 7.2 and 7.3, four unrelated commits landed on the branch from a parallel session (`466f7f4` PrTableApp row-handler memory leak / `useStableCallback`, and three `stability:heap-check` commits) - no file overlap with this plan's work.

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
| 7.1 | `bc07b84` | Data pipeline (`loadStoredData`/`renderPrData`/`applyFreshPrPayload`/`applyLatestPrData`/fingerprint helpers + the initial load) moved into `PrDataProvider` (`PrDataActionsContext`, `loadOnMount`); 15 bridges deleted incl. `mountReactPrTable`/`pollForDataChanges`. Integration harness's `PrDataProvider` hoisted to its root; `WindowBackedPrActivityProvider` gone. `index.page.js` 2100 -> 1603 lines. |
| 7.2 | `10a8bcf` | Backfill bootstrap: `initPage`'s status+log load was a duplicate of `useBackfillTabAutoRefresh`'s, so it's deleted with its replays and forwarders; `BackfillStatusProvider` owns `loadBackfillStatus` (actions Context). 13 bridges deleted (all 9 backfill ones, `setStatusMessage`, `updateReactStatusText`, `beginRequestActivity`, `getLatestSchedulerState`). e2e save-wait fixed for requests cancelled by `reload()`; two restore tests' cleanup race fixed. `index.page.js` 1603 -> 1326 lines. |
| 7.3 | `485fdc1` | New top-level `RequestActivityProvider` (above BackfillStatus/AutoRenderBlocking/PrData) owns request activity (from `PrDataProvider`), scheduler state + `renderSchedulerStatus` + the startup scheduler load (from `index.page.js`), and the drawer's badges/recent list (from `AppRoot` state). 7 bridges deleted (`renderRequestActivity`, `setLatestSchedulerStateAndRender`, `renderSchedulerStatus`, `updateReactRequestActivityBadges`, `updateReactRecentRequestActivity`, `AUTO_DATA_POLL_MS`, `AUTO_BACKFILL_POLL_MS`). `index.page.js` 1326 -> 1191 lines. |
| 7.3 follow-up | the commit after `485fdc1` | Review fixes: 7.3 broke the on-demand `stability:heap-check` (it pinned the deleted `window.AUTO_DATA_POLL_MS`); now `?dataPollMs=` via `readDataPollMsOverride` -> `PrDataPolling`'s `dataPollMs` prop. A test conversion 7.3 claimed but its edit script dropped is done; stale comments fixed. |
| 7.4 | the commit after `7156b89` | New headless `AutoRenderBlockingSync` (inside `AppRoot`'s `AuthorInsightsDraftsProvider`; `NotesDirtyProvider` now wraps `AppRoot`) computes the auto-render-blocking state from Context and pushes it via ARB's new `setBlockingState` action; the chips read it from ARB's display Context. New `AuthorInsightsDraftsVersionContext` (only the sync reads it). The `#pr-sections` listeners and actor-alias cache are gone; `index.page.js` rewritten to its live code, 1191 -> 130 lines, no `__testables`. 4 bridges deleted (`recomputeDirtyPrSectionsFields`, `pushAutoRenderBlockingState`, `updateReactAutoRenderBlockedLinks`, `getAuthorManualCommentsForLogin`); `getDirtyNotesPrNumbers`/`getAuthorInsightsDraftsSnapshot`/`getReactPrTablePayload` now test-only. |
| 7.4 follow-up | the commit after 7.4 | Review fixes: `AutoRenderBlockedLinksLive` (chip list `hidden`/`aria-label`) exported from `AutoRenderBlockedLinks.jsx` with 4 tests (7.4 had deleted the only tests of that logic); two stale comments. |
| 7.5 | the commit after `cb3bead` | **`index.page.js` deleted.** Credential-field hints are JSX props (`NON_CREDENTIAL_INPUT_PROPS`) on the six inputs; dropdown closing is `useMultiSelectDropdownClosing` in `AppRoot`; the error filters are installed by `react-app.jsx` before mounting. `viewprs:react-ready` gone. `applyCredentialHints` and `pr-filter-panel.helpers.js` deleted. |

Deviations from the plan text (each because investigation showed the wording didn't fit) are in `REACT_MIGRATION_PLAN.md`'s entries for each phase.

### Next: the test-only bridges (after Phase 7; Phase 6's approach)

Phase 7 is complete: `index.page.js` is gone (7.5), and **no production code calls a `window.*` bridge**. The numbered phases end there. What remains is the bridges Providers still publish only for tests, handled the way Phase 6 handled `persistViewFilterOptionOverrides`: fix the tests, then delete. Re-grep before starting (`grep -rn "window\.<name>" src e2e`).

- **Test-only now (no production caller; fix the tests, then delete, as Phase 6 did):** `setPendingAutoRenderPayload` (`AutoRenderBlockingProvider.test.jsx` and e2e's "Auto update paused" chip test use it to simulate a deferred poll, since the e2e server's static data never yields a real new payload), `getReactPrTablePayload` (integration tests and e2e read the shown payload), `getReactPrTableSelectedRepo`, `updateReactPrTable` (~10 test files push a payload with it), `updateReactSelectedAuthorLogin`, `getDirtyNotesPrNumbers`/`getAuthorInsightsDraftsSnapshot` (e2e's unsaved-notes/draft observers), `showErrorNotification`/`showWarningNotification`/`hideErrorNotification` (e2e Snackbar test), `updateReactOutputText` (e2e output-panel test + its unit test). Verify each with a whole-repo grep (lesson 9) before calling it test-only.
- Each: full lint + `test:ci` + `test:e2e`, a `REACT_MIGRATION_PLAN.md` entry, a commit.

### Lessons from Phases 1-7.5 (apply to every remaining phase)
1. **A component that only needs stable functions from a changing Provider must read them from a separate, stable Context.** `PrDataProvider` wraps the whole table tree and its `value` object is not memoized, so subscribing it (or anything high up) to a Context that changes re-renders every `usePrData()` consumer. Done so far: `AutoRenderBlockingActionsContext`, `OutputTextSetterContext`, `RequestActivityContext`, `BackfillStatusActionsContext`, `FilterFieldStoreContext`. Measure with a `React.memo` consumer's render count before and after; add a regression test.
2. **`useBackfillActions()`'s result identity must stay stable** (guards in `useBackfillActions.test.jsx` and an e2e request-count test): `useBackfillTabAutoRefresh` refetches whenever `triggerBackfillTabLoad` changes, so one unstable dependency in the provider chain is a request loop (498 requests/3 s measured). Every function a Provider publishes must be a `useCallback` over refs/setters.
3. **Windows**: never trust a file on `PATH` there (WSL's `System32\bash.exe` stub); POSIX-only assertions (executable bit) must be skipped on win32; `isCommandAvailable` must tolerate non-string input.
4. For every new regression test, **break the code and watch the test fail**, then restore. **Back up with `cat file > backup`, never `cp`**: `cp` is aliased to prompt here, and a refused copy leaves the old backup in place. In 7.5 that turned one script's "restore" into overwriting two files with a third file's content. Use one backup file per target, and `cmp` it after restoring.
5. Run the **exact CI commands** before committing: `npm run lint:check`, `npm run test:ci` (serial + coverage + state guards; it caught a bug bare `jest` missed), `npm run test:e2e`. Use Node 22.22.0: `export PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH` (the default shell had Node 16; Homebrew's Node is 22.1, below the required `>=22.22.0`).
6. The integration harness (`src/ui/integration-tests/index.html.test.js`) mounts providers as it likes; when a production Provider starts reading another Context, check the harness nests them the same way, or the feature silently goes inert there (hit this with `AutoRenderBlockingProvider` and `PrDataProvider`).
7. **When moving vanilla bootstrap work (a fetch on page load) into a Provider, make it opt-in** (a prop `mountAppRoot()` sets, like `PrDataProvider`'s `loadOnMount`): many component tests mount that Provider with their own initial state, and an unconditional mount-time fetch would overwrite it with whatever their fetch mock returns. The integration harness then has to mount that Provider at its root, after `fetch` is mocked.
8. **e2e tests share one server, so a cleanup that read-modify-writes `/view-prs/user-defaults` must first `waitForFilterPersist(page)`**: after a reload, the restore's own debounced save also reads then writes the overrides, and can land after the cleanup and put the test's values back for the next test to see. And before trusting a green rerun, find the flaky test; this step's one-in-four failure was a real bug in the save-wait (requests cancelled by `reload()` report no finished/failed event).
9. **Grep the whole repo, not just `src/`, before deleting a global** - an on-demand tool (`e2e/stability/long-session-heap-check.js`) depended on `window.AUTO_DATA_POLL_MS`, and no per-push check runs it. And **check that scripted edits actually landed** (re-read the file for the new text): one 7.3 edit script silently dropped half its changes while reporting success.
10. **When e2e fails in clusters of `page.goto`/`waitForSelector` timeouts, check machine load before debugging** (`Get-CimInstance Win32_Processor` LoadPercentage, then the top processes). In 7.4, another local session's CPU stress test (a busy loop on every core) made two full runs fail 9 and 7 tests; an unmodified worktree of the previous commit failed the same tests under that load. Compare against a clean worktree under the same conditions (junction `node_modules` into it), and rerun once the machine is idle.

### Known, unrelated, left alone
- `src/server/integration-tests/app.events-routes.test.js` heartbeat test (50 ms interval, fixed 100 ms wait) flaked once under full-suite load.
- `PrDataProvider`'s `value` object is not memoized (pre-existing amplifier for lesson 1).
- `view-prs.code-workspace` has an uncommitted user change (a Peacock `statusBar.inactiveBackground` colour) - not part of this work; don't commit it unasked.
- The dotfiles repo (`/Users/alihall/Sites/Personal/dotfiles`) has two local commits for the `PATH` fix (`c3a663e`, `7689e5e`, not pushed) and other uncommitted changes of the user's.
- Policy: don't push without asking; confirm before anything outward-facing.
