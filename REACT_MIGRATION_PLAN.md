# React Migration Plan - Phases 1 & 2 Complete

## 🎯 **Overview**

Migrating view-prs from vanilla JavaScript to React in phases, starting with the PR table component for maximum performance impact with minimal risk.

**Key Principle:** Incremental migration with working software at each phase

**Measured Performance:** React is 1.4-1.5x faster than vanilla at 50 PRs, 3.8-3.9x faster at 500 PRs, flat across how many PRs changed per update (not the delta-size-scaling 19x originally guessed) — see "Performance Validation" below for the real numbers and why

---

## 📋 **Phase Breakdown**

| Phase | Component | Time | Status |
|-------|-----------|------|--------|
| **Phase 1** | PR Table (Hybrid) | 30-40h | 🟢 **Complete — parity-verified in a real browser, performance measured** (1.4-3.9x faster than vanilla depending on dataset size, see "Performance Validation") |
| **Phase 2** | Filters & Controls | 20-30h | 🟢 **Complete** — every field in the Run & Filter tab is React-owned, 35 fields total (PR-number input, 4 selects, 10 checkboxes, 4 plain text/number inputs, 6 "Any (with/without)" plain selects, 1 textarea, all 9 multi-select dropdowns). Found and fixed two systemic bugs, each affecting every field of its kind converted so far at once — see gotcha #3 (orphaned "auto-apply on change" listeners, fixed via event delegation) and gotcha #4 below (multi-select restore-race clobbered by React's non-synchronous commit, fixed via `flushSync`). Also found and **fixed** a pre-existing, unrelated bug while testing the six plain selects: `deriveFilterPipelineState` never forwarded customComments/otherNotes/prDifficulty/rallyStories/rallyLinks/analysisOfPr into the real row-filtering criteria, so those six fields never actually filtered anything despite looking functional - now wired through. Some filter-dropdown compatibility work also landed alongside Phase 1 (see git history: "Fix dropdown auto-population", "Update attention rules and options"). **Decision (2026-09-11):** the original "remove vanilla JS filter variables / migrate debounce to hooks" items are explicitly deferred to Phase 6 rather than pursued here — vanilla staying the source of truth for `applyFiltersFromCache` (with React fields just mirroring it) is what made 35 fields convertible incrementally without Context or a state rewrite; unwinding that now would be a large, high-risk change touching every field's bridge code at once, for a goal ("filters render/behave via React") this phase already achieves |
| **Phase 3** | Other Tabs | 20-30h | 🟢 **Complete: Review Stats tab converted** (`<ReviewStatsControls />` + `<ReviewStatsContent />`, mounted into static `#stats-controls-root`/`#stats-content-root` siblings - `renderStatsView` never rebuilds either once React owns them), except the chart visuals' internal rendering (~900 lines of hand-rolled SVG/DOM building), which stays vanilla, wrapped via a ref. Found and fixed a real pre-existing bug along the way: a stats card's "View in table" button built its own raw-DOM navigation that never worked under a React-owned PR table - now routed through the same already-React-safe helper Author Insights uses. **Author Insights tab fully converted.** Its "Author" selector is converted (`<AuthorInsightsSelector />`, mounted into `#author-insights-selector-root`, same container-split approach), and its **created-PRs section**, **selected-author header**, **PR-linked notes section**, and **manual comments composer/list are all converted** (`<AuthorCreatedPrsSection />`/`<AuthorInsightsHeader />`/`<AuthorInsightsNotesSection />`/`<AuthorInsightsCommentsSection />`, mounted into their own `#author-insights-created-prs-root`/`#author-insights-header-root`/`#author-insights-notes-root` sibling containers and, for comments, the existing `#author-insights-content-root` - reused rather than a new container, since it was already the one dedicated slot that hadn't been carved out yet. The container-split bug class has now shown up **six** times in this phase alone). The created-PRs, notes, and comments sections all wrap the existing DOM-building helpers (`window.buildAuthorInsightsCreatedPrsSection`/`window.buildAuthorInsightsNotesSection`/`window.buildAuthorInsightsCommentsSection`, extracted as `buildCreatedPrsSection`/`buildPrLinkedNotesSection`/`buildManualCommentsSection` in `pr-author-insights.component.js`) via a ref+`useEffect`, rather than reimplementing their markup in JSX - the comments section especially, since its mutable composer/edit draft state and save/edit POST side effects (via `authorInsightsState`/draft helpers/`postJson`) all live inside the wrapped vanilla builder and its own DOM event listeners, never touched by React, so wrapping it is not just a JSX-verbosity shortcut but the safer choice for state that must survive independently of React's render cycle. The created-PRs section is mounted with an incrementing `key` (not a plain `[rows]` effect dependency) because the same `rows` array reference can recur across author switches - `renderAuthorInsights` reads `authorInsightsState.selectedAuthorLogin` internally rather than passing it as a prop, so a `[rows]`-only effect would silently miss author changes; verified by reverting the `key` and watching the "survives an unrelated re-render" e2e test fail with a stale render count. The notes/comments sections and the header don't need that trick: all three receive a freshly-computed `selectedAuthor`/`selectedAuthorName` value as a prop on every render (unlike created-PRs' `rows`-only prop), so a plain effect/re-render dependency already re-runs on every author switch. Converting the comments section required removing the last unconditional `contentHost.innerHTML = ""` reset that used to run at the top of every `renderAuthorInsights` call (originally there to rebuild the one remaining "scratch" section) - since `#author-insights-content-root` is now itself a persistent React root, that reset would have corrupted it the same way rebuilding `#pr-sections` via `innerHTML` would in Phase 1. The empty-rows/empty-author-options early-return branches' "No local rows/authors" message now appends into the outer `#author-insights` host directly instead. Also fixed two real pre-existing bugs along the way (this slice and the prior one): `renderAuthorInsights`'s empty-state branches cleared the React-owned selector but left the created-PRs/header/notes/comments sections showing stale content - now all five are cleared together; and each converted section's vanilla fallback path (used only when React hasn't mounted, e.g. bare-fixture unit tests, where the selector/header/comments/notes/created-PRs all share one `<div id="author-insights">`) had to specifically avoid resetting that *shared* fallback host's `innerHTML` - only the section's own *dedicated* container gets cleared; clearing the shared host unconditionally would wipe out whatever sibling sections had already appended into it. Verified all of the above by temporarily reverting the container-split fix (rebuilding the whole outer `#author-insights` host, matching the old pre-split behavior) and confirming the header, notes, created-PRs, *and* comments e2e tests all fail as expected, then restoring and confirming green across 3 full playwright runs. The comments e2e test exercises the actual save/edit POST round-trip (against this suite's isolated per-run data directory), not just static rendering - it's the first Author Insights conversion test to do so. **Backfill tab converted, completing Phase 3.** Its status badges are converted (`<BackfillBadges />`, mounted directly into the existing `#backfill-badges` container, same shape as Phase 2's `MultiSelectCheckboxList`/Phase 1's `#pr-sections` - no container-split needed since that div isn't shared with anything else, and no `key` remount needed since the component is a stateless display list, unlike `MultiSelectCheckboxList`'s checked-state). The rest of the tab (start/stop/refresh buttons, the status `<pre>`, the log `<pre>` and its auto-scroll checkbox) stays vanilla - it's plain text/attribute updates and polling, not list rendering, so converting it would add JSX ceremony without removing any real complexity. Verified via a new e2e test that visits the tab and clicks "Refresh status" (a real but non-destructive GET against the isolated per-run data directory - never starts/stops the actual backfill process) and confirms the badges render and survive the refresh; full jest suite and 3 full playwright runs (30/30) green. **Phase 3 is now complete.** Post-completion follow-up (2026-09-15), Track A of the finish-the-migration effort: the Review Stats chart visuals (previously the one deliberate exception above - `createStatsVisuals`/`createReviewerActivityChart`, ~900 lines of hand-rolled `document.createElement` DOM building in `pr-review-stats-chart.component.js`/`pr-review-stats-visuals.component.js`, wrapped via a ref+`useEffect`) are now real JSX: `GraphCard.jsx` (the horizontal-bar metric cards), `ReviewerActivityChart.jsx` (the heatmap + hand-rolled div-based line chart, including the `ResizeObserver`-driven responsive width, the legend click-to-highlight/dim interaction, and the hover tooltip - all ported to React state instead of closure variables and imperative `.style`/`.textContent` mutation, deliberately keeping the same div-based line-chart approach rather than rewriting against `<svg>` or a charting library), and `StatsVisuals.jsx` (the composing container, replacing `ReviewStatsContent.jsx`'s `StatsVisuals` ref-wrapper). Both vanilla `.component.js` files and their tests were deleted; `createStatsGraphCard` (previously defined inline in `index.page.js`) was removed the same way once its only caller (`createStatsVisuals`) was gone. The pure data-shaping helpers those components need (`bucketTimelineChartData`, `aggregateReviewerCommentsTimeline`, `aggregateReviewerApprovalsTimeline`) are still vanilla, now exposed on `window` the same way every other leaf component already reads `window.toCount`/`window.asArray` - moving that data layer itself off `window` is Track C's (orchestration) concern, not this one. `GraphCard`'s header-click sort-by wiring now goes through the already-exposed `window.updateStatsViewStateAndRerender({ sortBy })` bridge rather than mutating `statsViewState` directly, since the raw state object was never exposed on `window` (only a snapshot via `getStatsViewState`). Verified with new `GraphCard.test.jsx`/`ReviewerActivityChart.test.jsx`/`StatsVisuals.test.jsx` (closing the prior gap where `ReviewStatsContent.test.jsx` always stubbed `window.createStatsVisuals` to return `null`, so the actual chart-building integration had zero test coverage) plus a new real-integration test in `ReviewStatsContent.test.jsx` itself; full jest suite green (207 suites/1862 tests) and a live Playwright check against the running app confirmed the heatmap, line chart, hover tooltip, and legend-click highlight/dim/focus-summary-text all render and behave identically to the vanilla original on real production data. Track B, batch 1 (2026-09-15): Author Insights' "PRs created by this author" and "PR-linked custom comments and sentiment" sections are now real JSX too - `AuthorCreatedPrsSection.jsx`/`AuthorInsightsNotesSection.jsx`, composing two new shared leaf components, `AuthorInsightsPrLink.jsx` (external GitHub link + "View in table" button) and `AuthorInsightsPrDataMeta.jsx` (status/approved/CHK/conversations/viewed-files/labels meta row) - replacing the ref+`useEffect` wrappers around `pr-author-insights.component.js`'s `buildCreatedPrsSection`/`buildPrLinkedNotesSection` (both deleted, along with the `window.buildAuthorInsightsCreatedPrsSection`/`window.buildAuthorInsightsNotesSection` bridges and the no-longer-used `prLinkHelpers` destructure). `AuthorCreatedPrsSection` now receives `selectedAuthorLogin` as a real prop (from `renderAuthorInsights`, via `window.updateAuthorInsightsCreatedPrs(rows, selectedAuthorLogin)`) instead of the wrapped builder reading `authorInsightsState.selectedAuthorLogin` from a closure - this removes react-app.jsx's previous incrementing-`key` remount hack for this component entirely, since a real prop change is now enough to re-derive the filtered/sorted list. The manual comments composer/editor (with its mutable draft state and save/edit POST round-trips) stays ref-wrapped for now - that's batch 2. Both new sections still read their pure filtering/sorting/formatting helpers off `window` (`getPreferredActorKey`, `sortAuthorInsightsCreatedPrsDesc`, `sortAuthorInsightsNoteMatchesDesc`, `noteAuthorMatchesSelection`, `getAuthorInsightsSentimentLabel`/`BadgeClassName`, `getAuthorInsightsCreatedPrStatus`/`StatusBadgeClassName`, `getAuthorInsightsNoteDisplayTimestamp`, plus a new `navigateToPrInTableFromAuthorInsights` bridge reusing the same React-safe `prAuthorInsightsPrLinkHelpers.navigateToPrInTable` Review Stats' own "View in table" button already uses) - the same "leaf components read window.* for pure data-shaping, moving that off window is Track C's job" pattern Track A established. Verified with new `AuthorInsightsPrLink.test.jsx`/`AuthorInsightsPrDataMeta.test.jsx`/rewritten `AuthorCreatedPrsSection.test.jsx`/`AuthorInsightsNotesSection.test.jsx` (real rendering/behavior instead of "was the bridge called with the right args"), full jest suite green (209 suites/1869 tests), lint clean, and a live Playwright check against the running app on real production data confirming both sections render correctly, author-switching updates them without a key remount, and "View in table" correctly navigates to the PR data tab. Track B batch 2 (2026-09-15), the hardest remaining piece: the "Manual author comments" composer/editor is now real JSX too (`AuthorInsightsCommentsSection.jsx`), replacing the ref+`useEffect` wrapper around `buildManualCommentsSection` and its `renderComposerForm`/`renderManualCommentList`/`renderManualCommentItem`/`renderEditForm` helpers (all deleted). The key design constraint this batch had to respect: composer/edit draft state could **not** become local-only React state, because `pr-auto-render-blocking.helpers.js`'s `getBlockingAuthorInsightsLogins` reads `authorInsightsState.manualCommentDraftByAuthorLogin`/`manualCommentEditDraftByAuthorLogin`/`manualCommentsByAuthorLogin` directly to decide whether an incoming poll should be blocked because the user has unsaved author-comment edits - a feature with zero test coverage in any of the files touched so far that would have silently broken had drafts moved to component-local state instead. So the new component keeps writing through the same `authorInsightsState`-backed bridges (`getAuthorInsightsComposerDraft`/`updateAuthorInsightsComposerDraft`/`getAuthorInsightsEditDraft`/`updateAuthorInsightsEditDraft`/`resetAuthorInsightsEditDraft`/`getAuthorManualCommentsForLogin`/new `setAuthorInsightsManualComments`, all newly exposed on `window`) and only uses local `useState` to trigger re-renders - the same "vanilla remains source of truth, React re-renders on top" shape as every earlier bridge, just now presented as controlled JSX inputs instead of raw DOM with manual event listeners. The save/edit POST/PUT calls (`window.saveAuthorManualComment`/`window.updateAuthorManualComment`, wrapping the existing `pr-author-insights-data.helpers.js` functions directly rather than going through the component factory) live inside the component now, not in a wrapped vanilla builder. With `buildManualCommentsSection` gone (the last of the three `build*Section` builders), `pr-author-insights.component.js` shrank dramatically: it's now just `renderAuthorInsights` orchestration (selector + header + three section-update calls + empty-state handling) - `prLinkHelpers`/`dataHelpers`/`draftHelpers` stay required constructor dependencies for contract stability but are no longer destructured/used internally, since their only consumers moved to the JSX components. Verified with a new `AuthorInsightsCommentsSection.test.jsx` (16 tests covering composer typing/validation/save-success/save-failure, edit/cancel/edit-save, loading/error states, and author-switch reset - closing the gap where this exact flow previously had zero jsdom coverage, only a Playwright e2e test), a rewritten `pr-author-insights.component.test.js` (removed the now-impossible "rebuild the manual comments section directly" test since that function no longer exists), full jest suite green (209 suites/1876 tests), lint clean, and a live Playwright run against the actual running app that added a real comment, confirmed "Saved." and the comment appearing in the list, then edited it via the real PUT round-trip and confirmed the updated text rendered - all with zero console errors. **Track C begins (2026-09-16): moving index.page.js's data-fetching/polling/state orchestration into React**, working toward eventually deleting index.page.js and react-mount-bridge.js entirely (see this doc's own "Performance Validation" note that index.page.js staying a classic script outside the React module graph was always provisional, pending this exact phase). A C0 inventory pass first classified all ~90 `window.X` bridges index.page.js exposes or consumes: most are either (a) pure formatting/data-shaping helpers with no DOM role (the large `Object.assign(window, {...})` block, `toCount`/`formatIsoDatetime`/etc. - eventually convertible to plain ES module imports, not a state-migration concern) or (b) "React calling back into vanilla to mutate one of several independent shared-state pockets" (`authorInsightsState`, `statsViewState`, filter-field state, selected-PR-numbers, dirty-field tracking, viewed-files state, review-conversations UI state - at least 7 separate pockets, each with its own read/write bridge functions, not one unified data blob). That finding reshaped the slice plan: there's no single "move the data into Context" slice: Track C is "migrate N independent state pockets/concerns one at a time," starting with the one that touches zero data-model concerns at all. **Slice C1 (polling interval ownership) is complete.** `<PrDataPolling />` (react-app.jsx, mounted as a headless React root with no visible UI - it renders `null`, so needs no DOM container) now owns the four auto-refresh `setInterval`s (data/scheduler/backfill/activity-render) and the visibility-pause/beforeunload-cleanup lifecycle that used to live in index.page.js's own `cleanupIntervals`/`restartIntervals` - ported 1:1, same cadences (`AUTO_DATA_POLL_MS`/`AUTO_BACKFILL_POLL_MS`, now exposed on `window` as the single source of truth for interval timing), same pause/resume-on-visibility and clear-on-beforeunload behavior. The four polled functions themselves (`pollForDataChanges`/`pollSchedulerStatus`/`pollBackfillStatus`/`renderRequestActivity`) are unchanged and still live in index.page.js, now exposed on `window` for `<PrDataPolling />` to call - only *what decides when they run* moved; their own fetch/parse/dedup logic is a later slice. The blast radius here was bigger than the code change itself: index.page.js's 8,451-line integration suite (`index.html.test.js`) had ~8 separate test blocks (38+ call sites) that mocked `global.setInterval` specifically to intercept the `pollForDataChanges`/`pollSchedulerStatus` registration calls index.page.js used to make directly - all rewritten to call `window.pollForDataChanges()`/`window.pollSchedulerStatus()` directly instead, now that nothing registers a real interval inside index.page.js itself to intercept. `index.page.memory-leak-prevention.test.js` (previously pure literal-source-text regex matching against index.page.js, e.g. `expect(sourceCode).toContain("let pollDataInterval = null;")`) was rewritten as `index.page.memory-leak-prevention.test.jsx` - real behavioral tests using jest fake timers against `<PrDataPolling />` (mount/unmount, hide/show, beforeunload), verifying actual interval start/stop instead of matching text patterns that no longer exist anywhere. Also added a new dedicated `PrDataPolling.test.jsx` (7 tests) covering per-interval cadence independently. Verified with full jest suite green (210 suites/1881 tests), lint clean (same 17 pre-existing index.page.js errors, none new), and a live Playwright check against the running app confirming the bridges exist, manual invocation triggers real network calls, and - the test that actually matters here - automatic polling fires on its own after waiting 32s in a real browser with zero manual triggering and zero console errors, proving `<PrDataPolling />` genuinely drives production polling now, not index.page.js. **C2 investigation (2026-09-16) found this slice needs its own split too.** `latestStoredPayload` isn't privately used by `renderPrData` - it's threaded via getter/setter closures into 9+ independent helper/orchestrator factories (exports, stats, author-insights, apply-filters-cache, single-PR-update, merged-request, data-tab orchestrator, react-callbacks), and there are three different write-then-render patterns in the code today: (1) the main `renderPrData` funnel, (2) mutate-then-`applyFiltersFromCache` (which eventually calls `renderPrData` anyway), and (3) mutate-then-directly-call `window.ReactMountBridge.update(...)`, completely bypassing the orchestrator pipeline - a deliberate perf optimization used by the checkbox/Ack/Apply-Label React callbacks and the label-dropdown refresh, so a same-PR-toggle doesn't re-run the full stats/filter-dropdown/export-catalog/author-insights pipeline for a change none of that depends on. Naively collapsing everything onto one Context-backed writer would silently turn those fast-path actions into full-pipeline re-renders - a real behavior/perf regression, not just a refactor. So C2 splits into C2a (unify the fast-path writer into one named function, still backed by the module-level variable - done) and C2b (swap the backing store to Context/hooks and delete the bridge - not started). **Slice C2a is complete.** The two previously-duplicated inline `if (window.ReactMountBridge?.isMounted?.()) { window.ReactMountBridge.update(...) }` call sites (inside `refreshAvailableRepoLabels` and the `updateReactTable` dependency passed into `react-callbacks.helpers.js`'s `createReactCallbackHelpers`) now both call one shared `pushPayloadToReactTable(payload, repo)` function - purely a consolidation, zero behavior change, so C2b only has to change what happens *inside* this one function later instead of hunting down scattered direct bridge calls across the file. Verified with the full jest suite green (210 suites/1881 tests, unchanged - this slice needed no new tests since it's a pure extract-function refactor with identical resulting calls), lint clean, and a live Playwright check against the running app: toggled a real "In Review" checkbox, confirmed the real `POST /view-prs/ack` fired with the correct `inReviewClear` body and the checkbox visually updated with zero console errors - the exact fast path `pushPayloadToReactTable` now owns. **Slice C2b is complete (2026-09-16): `react-mount-bridge.js` is deleted.** On reflection, deleting it didn't actually require the larger "move `latestStoredPayload` into Context" migration first - `react-mount-bridge.js` was just a thin wrapper around `window.mountReactPrTable`/`window.updateReactPrTable` (both still owned and exposed by react-app.jsx, unchanged) plus an `isMounted()` boolean and a console-logging layer. Its `mount`/`update`/`isMounted` logic is now inlined directly into index.page.js as three local functions (`mountReactTable`/`updateReactTable`/`isReactTableMounted`, plus a local `reactTableMounted` flag replacing the bridge module's own closure-held state) - same behavior, one less indirection layer, zero change to react-app.jsx or `PrTableApp`. Its `unmount()` was confirmed dead code (no production caller anywhere) and wasn't ported. `renderPrData`'s old `hasReactBridge` check (whether the bridge *script* had loaded) is gone too - meaningless now that the logic lives in the same file, so only `hasReactApp` (whether react-app.jsx's deferred module has loaded) still gates the mount-race branch. `PrTableApp`'s `useState`+prop-resync-`useEffect` (deliberately *not* touched this slice - see C2a's note above about the two-distinct-actions design) still exists and is still the correct pattern per React's own docs for "sync local state from an external prop while other local state must survive" - reframing it as something to "fix" was based on an incomplete read of C2's original text; it isn't broken and isn't part of what actually blocked deleting the bridge. The real test-blast-radius here was `index.html.test.js`'s `installReactTableMountBridge()` stub, which used to define its own complete `window.ReactMountBridge = {mount, update, isMounted}` (doing real RTL rendering) entirely independent of `window.mountReactPrTable`/`updateReactPrTable` - since index.page.js no longer reads `window.ReactMountBridge` at all, that stub was dead weight the moment this slice landed. Rewrote it to define `window.mountReactPrTable`/`window.updateReactPrTable` themselves (the actual functions index.page.js now calls directly), replicating react-app.jsx's real contract (mounting sets `window.updateReactPrTable` as a side effect) via the same real RTL rendering underneath - and rewrote the one test that simulated "mount genuinely fails" (previously `window.ReactMountBridge.mount = () => false`, which only worked because the old bridge's `mount()` returned `true` unconditionally unless an exception was thrown - a `false` return from the *inner* `mountReactPrTable` was never actually a failure path) to make `window.mountReactPrTable` throw instead, which is what `mountReactTable`'s try/catch genuinely guards against. `react-mount-bridge.test.js` (entirely dedicated to the now-deleted module) was deleted outright rather than rewritten. Verified with the full jest suite green (209 suites/1871 tests - down from 210/1881 only because the ~10 dead bridge-module tests are gone, no other count changes), lint clean (same 17 pre-existing errors), and a live Playwright check against the running app confirming `window.ReactMountBridge` is now `undefined`, `window.mountReactPrTable`/`updateReactPrTable` exist and the table renders, and a real checkbox toggle still fires the correct `POST /view-prs/ack` end-to-end with zero console errors. **Next up (not yet started, and now understood to be optional rather than required for the bridge-deletion goal): actually moving `latestStoredPayload`/`latestPrManifest`/dedup-fingerprint state into React state/Context** - worth reassessing later against Track C's remaining slices (C3/C4/C5) rather than assumed necessary, since the getter/setter-into-9-factories pattern is a working, legitimate DI shape today, not obviously broken. |
| **Phase 4** | Testing & Cleanup | 20-30h | 🟢 **Complete (2026-09-15) - large-scale stability run closed the last gap, see below.** jsdom suite at 1722/1722 (201 suites, as of the Phase 5 delta-aware-pipeline slice - suite/test counts shift slightly each slice as fallback-only tests get deleted/rewritten or new ones added); Playwright e2e smoke suite at 30/30, stable across repeated full runs; bundle size, initial load, and memory usage all measured this pass (see "Performance Targets" below - all well under target). Long-session stability testing (leaving the app open across many data refreshes/interactions to check for leaks/drift) not attempted - no existing harness for it and the measured ~11MB heap after a fresh load gives no signal either way about growth over time; would need a dedicated long-running script, not a quick addition. **Long-session stability harness added (2026-09-15):** `e2e/stability/long-session-heap-check.js` (run via `npm run stability:heap-check`, params `--cycles`/`--sample-every`/`--dataset-size`) - a standalone script (not picked up by `npx playwright test`'s globbing, confirmed via `--list`), reusing playwright.config.js's exact env-var isolation pattern against a synthetic dataset, never touching real `data/*.json`. Drives real interactions per cycle (in-review checkbox toggle every cycle - the main lever, since it exercises a real render/update without waiting on `AUTO_DATA_POLL_MS`'s real interval; data-tab switching every 5 cycles; a Run & Filter field edit plus a label multi-select toggle every 10 cycles), forces a GC pass via CDP `HeapProfiler.collectGarbage` before each `Performance.getMetrics` sample so a reading reflects retained memory rather than not-yet-collected garbage, and reports a first-quartile-vs-last-quartile heap comparison. **Two validation runs completed this session:** 20 cycles/15 PRs (11.67MB -> 13.11MB, 1.12x) and 80 cycles/40 PRs (12.64MB -> 15.86MB, 1.22x, see the full per-sample curve: 12.64/13.36/14.77/15.40/15.57/15.70/15.75/15.81/15.86MB) - both show heap growing early then clearly plateauing (an asymptotic curve, not sustained linear growth), the expected healthy pattern for one-time allocations/code-cache warmup, not a leak signature. This was evidence against a fast/severe leak, not proof against a slow one - closed out below. **Large-scale run (2026-09-15):** a calibration run first established the harness's real per-cycle cost is much lower than assumed (~40-90ms/cycle, not "hours to reach thousands of cycles" - 100 cycles including full server/vite/browser startup completed in under 9s), so a genuinely conclusive run doesn't need literal multi-hour wall-clock time, just a much larger interaction volume than the earlier short validation runs. Ran 20,000 cycles / 50 PRs / sampled every 200 (101 total samples) in the background: heap climbed from 13.07MB to ~17.7-17.8MB over the first ~1,000 cycles (one-time warmup - code caches, growing internal structures for the larger dataset), then stayed essentially flat (18.4-18.6MB, noise-level fluctuation only) for the remaining **19,000 cycles** - first-quartile mean 17.80MB vs last-quartile mean 18.53MB, 1.04x. 19,000+ cycles of sustained flatness after initial warmup is a genuinely conclusive signal, not just "no signal yet" - **no leak detected across real in-review-checkbox-toggle/tab-switch/filter-edit interaction cycling at this scale.** Verified cleanup (no leftover server/vite/browser processes after the run) and real `data/*.json` untouched throughout (isolated temp-directory server only). **Phase 4's last gap is now closed.** |
| **Phase 5** | Performance Tuning | 10-20h | 🟢 **Delta-aware render pipeline landed (2026-09-14) - see the writeup below.** **Memoization audit done (2026-09-12), no changes made:** the components that actually matter for it - `PrTableApp`'s `sections`/`getPrFlags`/`checkNeedsAttention` derivations and every PR row (`PrRow.jsx`) - were already memoized back in Phase 1. `PrSection.jsx` (one per lifecycle/smart-group section, typically single digits per render) isn't memoized, but that only costs re-running its own lightweight header logic on unrelated re-renders - the expensive part (per-row DOM reconciliation) is already gated by `PrRow`'s own `React.memo`, so wrapping `PrSection` too would be speculative optimization with no measured problem behind it. Every other Phase 2/3 component is either a mount-once/update-via-bridge root (only re-renders when its vanilla bridge explicitly calls update, never on unrelated React state) or already forced to fully remount via an incrementing `key` (`MultiSelectCheckboxList`, `AuthorInsightsSelector`, `AuthorCreatedPrsSection`) where memoization would be actively pointless. **Code-splitting (lazy-loading tabs) assessed, not pursued:** with the bundle already measured at 230.62 kB raw/69.61 kB gzip and initial load at 164-174ms (see Phase 4's "Performance Targets", both comfortably under target), splitting would add `Suspense`/async-chunk complexity to solve a problem that measurement shows doesn't exist. **The one real identified opportunity (making the shared `renderPrData`/`deriveRenderPipelineState` pipeline delta-aware - see "Performance Validation" below) was deliberately not attempted:** it would touch the shared render path underneath every one of the 35+ already-converted Phase 2 fields plus every Phase 3 tab at once, for a win that's already inside target in absolute terms (194-210ms worst case, 500 PRs) - a large, cross-cutting risk for a metric that isn't actually failing. Left as a documented opportunity, not pursued without a specific ask. **Delta-aware render pipeline (2026-09-14), 4 slices:** picked up the deferred opportunity above at the user's explicit ask, accepting the larger cross-cutting scope. **Slice A (tab-visibility gating):** `applyRenderResults` (pr-render-apply.helpers.js) used to always fully rebuild the Author Insights panel and Stats view on every render, regardless of which of the 3 data tabs was actually visible - no visibility check existed anywhere. Now skips whichever of the two is behind a `hidden` tab panel, with a "catch-up" render wired into the tab-click handler itself (`onTabActivated` DI hook, pr-data-tabs.helpers.js) using the same `(allStoredRows, actorsMap)` the pipeline most recently computed, cached in a closure rather than re-derived, to guarantee no drift from what the shared pipeline actually computed. **Slice B (dedupe):** found and removed a genuine duplicate - `populateFilterOptions` (the 9 filter dropdowns) ran twice per render, once inside the orchestrator's own pipeline and again via a separate `populateFilterDropdownsForCurrentPayload` call right after in `renderPrData`'s React path. That second call's own doc comment explained it as covering a case where "the React render path... never runs that pipeline" - true of an earlier architecture where the React path bypassed the orchestrator entirely, no longer true since it's called (with `skipTableRender`) right above it. Deleted the now-fully-redundant call, its helper file (`pr-react-filter-dropdowns.helpers.js`), and updated a stale comment in react-app.jsx that referenced the double-call as the reason `renderReactMultiSelectList`'s `flushSync` wrapping exists (that reasoning was updated to describe the real, still-valid reason - any same-tick DOM read after a `root.render()` needing to see the committed result, not specifically this now-gone double-call). Verified via the 3 multi-select-specific e2e tests (label/exclude-label/author/assigned/approver/thread-resolution persisted-restore) plus the full suite, confirming the second call was genuinely dead weight, not secretly load-bearing. **Slice C (the core mechanism):** added `pr-entry-derived-cache.helpers.js` - a small, generic `WeakMap`-keyed-by-entry-object cache (`getOrCompute(entry, cacheKey, computeFn)`). Low-risk by construction: `mergeDataDeltaPayload`'s shallow spread (pr-data-polling.helpers.js) means a PR entry that didn't change in a given poll keeps its exact object reference, so cache correctness falls entirely out of `WeakMap` identity semantics - a changed entry is just a different/absent key, a removed one is naturally GC'd, no manual invalidation logic exists to get wrong. One shared instance created once at page-init (index.page.js), not per-render. **Slice D (wiring):** applied the cache to the two dominant per-entry costs the investigation identified: `rowMatchesUiFilters` (pr-row-filtering.helpers.js's `applyRowUiFilters`) - a fairly expensive many-condition predicate, now cached per `(entry, current-filter-criteria-fingerprint)` so a filter-selection change still busts every entry's cached result correctly, while an unchanged entry under unchanged filters is a pure cache hit; and the label/assignee/approver extraction (`extractRowLabelNames`/`collectAssignedUsers`/`collectApproversFromRow`) the 9 filter dropdowns' populate functions (`pr-filter-panel.component.js`) run per entry - cached per-entry with no fingerprint needed (these are pure functions of the entry alone). The dropdown DOM-rebuild-skip (comparing a value-set signature to avoid rebuilding unchanged `<option>`/checkbox DOM) from the original plan was *not* pursued - given the outer per-entry extraction is now cached, the remaining cost there is just an O(n) Map-building pass over cheap cache hits, judged not worth the added per-list signature-design risk without a measurement showing it still matters. Every default stayed backward-compatible (`getOrCompute` optional, defaults to an uncached passthrough) so no existing unit test needed to change to keep passing. **Measured impact:** re-ran the original Performance Validation methodology exactly (same temporary, non-committed `window.__perfRenderPrData` hook - added and reverted via direct edit, never landed in a commit - same 50/500 PR synthetic fixtures, same 1/3/10/all-changed scenarios, 7 repeats, medians) against the post-Phase-5 codebase: 50 PRs went from 33.9/31.9/31.5/32.3ms (1/3/10/50 changed) to 31.1/27.2/27.1/26.2ms - 8-19% faster; 500 PRs went from 209.8/193.6/195.8/194.1ms to 172.5/167.2/165.4/166.1ms - 14-18% faster. **Real, meaningful improvement across the board, but the flat-regardless-of-delta-size shape substantially persists** - caching the dominant per-entry cost exposed the *next* layer of always-O(n)-regardless-of-delta work as the new bottleneck: `buildGroupedPrSections`'s full sort, `computePrDataFingerprint`'s full-payload re-stringify every render, the dropdown populate functions' own O(n) Map-building iteration (now over cheap cache hits, but still O(n)), and React's own reconciliation walking every row. None of these were touched, consistent with the plan's own "leave sorting/grouping alone, only revisit if measurement shows a gap" reasoning - measurement now shows one exists, but closing it further would mean incrementally-patched data structures (the explicitly-flagged, highest-risk piece this slice deliberately avoided) rather than another straightforward caching win. Verified: full jest suite (201 suites/1722 tests) green after each slice, not just at the end; 3 full playwright runs (30/30) green, stable. Real data confirmed untouched throughout (isolated temp-directory servers only, including for the performance measurement's own isolated server instance). |
| **Phase 6** | Remove Vanilla JS | 10-20h | 🟢 **Complete (2026-09-14) - see the full slice-by-slice history below.** **Started (Slice 1, 2026-09-12):** introduced `FilterStateContext`/`FilterStateProvider` (`src/ui/state/`) as the first real Context-based filter state, replacing the Phase 2 decision to keep vanilla DOM values as the source of truth - see that decision's own note above for why Context wasn't used originally. **Structural blocker solved via `createPortal`:** every Phase 2 field mounts via its own independent `ReactDOM.createRoot()`, and Context cannot cross independent tree boundaries - `mountFilterStateProvider()` (react-app.jsx) now mounts one root (a hidden but document-attached anchor - a *detached* one would break native event bubbling to React's own root-level listener) and `createPortal()`s each migrated field into its existing `<span id="…-root">` container, so no index.html markup changed. **Two fields migrated as the proof of concept:** `scope-mode` (`ScopeFilterSelect.jsx`) and `always-show-in-review` (`AlwaysShowInReviewCheckbox.jsx`), chosen as the simplest structurally-different pair (a select and a checkbox). Both now read/write `useFilterState()` instead of local `useState`; `deriveRunPrDataContext`'s scope-mode read (`pr-run-pr-data-context.helpers.js`) and `shouldAlwaysShowInReviewRows` (index.page.js) prefer `window.getFilterStateValues()` over the DOM when the provider has mounted, falling back to the original `getElementById` read otherwise (same handled/fallback shape as every Phase 2/3 bridge); `persistUiOptionOverrides`/`restoreUiOptionOverrides` do the same via `window.getFilterStateValues`/`setFilterStateValue` for just these two field ids. The vanilla debounce (`filterChangeDebounceTimer`/`debouncedApplyFilters`) is *unchanged and still the thing that actually runs* - only what triggers it for these two fields moved, from the delegated `#run-script-form` "change" listener to a `useDebouncedEffect` hook (`src/ui/state/useDebouncedCallback.js`) inside the provider; `debouncedApplyFilters` is now also exposed as `window.debouncedApplyFilters` so the provider can call it. The delegated listener still fires for these two fields too during this transition (harmless double-hookup, collapsed by the debounce) - removing it is deferred until every field is migrated. **A real bug caught before it shipped:** `createPortal(children, container)`, unlike `ReactDOM.createRoot(container).render()`, does **not** clear `container`'s existing children on first mount - every other Phase 2 field's fallback markup gets replaced automatically by `createRoot()`, but portaling into the same kind of container left the vanilla fallback `<select>`/`<input>` sitting there *alongside* React's output, silently duplicating both elements. Caught via a genuine Playwright "strict mode violation: resolved to 2 elements" failure (not anticipated in the plan) across 3 e2e tests; fixed by explicitly clearing each portal target's `innerHTML` right after reading its fallback value, before mounting - now documented in `mountFilterStateProvider`'s own comment for the next slice to remember. Verified: full jest suite (206 suites/1728 tests) and 3 full playwright runs (30/30) green; also verified the *old* vanilla fallback path still works completely unchanged by temporarily disabling `mountFilterStateProvider()` and re-running the affected e2e tests (all passed against the pure-DOM mechanism) - proving the fallback is real, not just present. Real data confirmed untouched throughout (isolated temp-directory servers only). **Not touched yet:** the other 33 fields (remaining scalars/checkboxes/text-inputs, the 9 multi-select lists, the 2 special-case persist-on-change fields), removing the delegated listeners/vanilla debounce/`persistUiOptionOverrides`'s DOM-reading branches (blocked on every field migrating first), and removing any vanilla fallback markup/branches (blocked on React being assumed always-available, the true end state) - see the approved plan at the time of this slice for the full sequencing. **Slice 2 (2026-09-12):** migrated the "Needs Attention rules" batch onto the same Context - `attention-no-activity-mode` (select, `AttentionNoActivityModeSelect.jsx`, same treatment as `scope-mode`) and the five rule checkboxes (`attention-include-pending-comments`/`-ignore-merge-only-commits`/`-include-closed-merged`/`-include-draft-changed`/`-include-draft-no-activity`). Rather than migrating the shared `FilterCheckbox.jsx` itself (which would force its *other* consumers - the Run Script options checkboxes, unrelated to filter state - onto Context too, and contradict its "no field-specific behavior" generic design by forking on id), added a parallel **`ContextFilterCheckbox.jsx`**: identical shape, but reads/writes `useFilterState()` via a `filterStateKey` prop instead of local `useState`. Extracted the growing per-field id-to-Context-key mapping and its read/write helpers into one shared `FILTER_STATE_FIELD_MAP`/`getFilterStateOverrideForFieldId`/`setFilterStateOverrideForFieldId` trio (index.page.js) - Slice 1 had one inline copy of this map in each of `persistUiOptionOverrides`/`restoreUiOptionOverrides`; a third and fourth consumer (`getNeedsAttentionConfig`, `shouldAlwaysShowInReviewRows`) made a single shared source of truth worth doing now rather than copying a fifth/sixth time. `FilterStateProvider`'s debounced-apply effect dependency list grew to include all 6 new keys (documented in its own comment: keep it in sync with `debouncedApplyOnChangeIds`). `mountFilterStateProvider` (react-app.jsx) is now table-driven for the checkbox batch (`FILTER_STATE_CONTEXT_CHECKBOX_FIELDS`) rather than one-off per field, to keep the growing container-lookup/seed/clear/portal boilerplate manageable. Verified the same way as Slice 1: full jest suite (207 suites/1732 tests - one unrelated, non-reproducing flake in a server integration test, confirmed pre-existing and unrelated by running it in isolation and re-running the full suite clean) and 3 full playwright runs (30/30) green; temporarily disabled `mountFilterStateProvider()` again and re-ran the affected e2e tests (including "Needs Attention rule controls...survive a persisted restore together") against the pure fallback mechanism - all passed. Real data confirmed untouched. Now 8 of 35 fields migrated. **Slice 3 (2026-09-12):** migrated the "Run Script options" batch - `open-mode` (select, `OpenModeSelect.jsx`), `repo`/`limit`/`merged-limit`/`jobs` (text/number inputs, new **`ContextRunScriptTextInput.jsx`**, same "separate component rather than branching the generic one" reasoning as `ContextFilterCheckbox` vs. `FilterCheckbox` in Slice 2), and `ack-changed`/`show-reason`/`quiet` (checkboxes, reusing `ContextFilterCheckbox` directly - no new component needed there). Lower-risk than Slices 1-2 in one respect: none of these 8 fields are read via a direct `getElementById(...).value` anywhere in the render/apply pipeline - `getFormBody` (index.page.js, feeding the "Run script" POST) reads them all via `new FormData(form)` off their real `name` attributes, which transparently reflects whatever React renders into that DOM node regardless of migration status, so that call site needed **no changes at all**. Only `getOpenModeFilter` (a `deriveFilterSelectionInputs` DI param) needed the usual handled/fallback treatment, plus the standard `FILTER_STATE_FIELD_MAP`/`persistUiOptionOverrides`/`restoreUiOptionOverrides` wiring. None of these 8 are in `debouncedApplyOnChangeIds` (they're only read on the "Run script" button click, never auto-applied), so `FilterStateProvider`'s debounced-apply effect dependency list is unchanged this slice. Deleted the now-fully-superseded `RunScriptTextInput.jsx`/`.test.jsx` (its `mountRunScriptTextInputs`/`mountOpenModeSelect`/`mountFilterCheckboxes(RUN_SCRIPT_CHECKBOX_FIELDS)` call sites and field-array constants in react-app.jsx are gone too) rather than leaving orphaned dead code alongside its Context-based replacement. Verified the same way as Slices 1-2: full jest suite (207 suites/1731 tests) and 3 full playwright runs green (one unrelated one-off flake on an unmodified test, "page loads, PR table renders, and no requests or console calls fail," confirmed non-reproducing across 4 subsequent full runs and passing standalone); temporarily disabled `mountFilterStateProvider()` and re-ran every affected e2e test (including "Run Script options...survive a persisted restore together") against the pure fallback mechanism - all passed. Real data confirmed untouched. Now 16 of 35 fields migrated - remaining: `filter-pr-numbers` (own dedicated non-delegated listener, needs its own look), `attention-author-thread-resolution-mode` (has dependent show/hide UI logic), the 6 "Any (with/without)" plain selects, the 2 special-case persist-on-change fields (`change-filter-use-builtin-merge-pattern`, `change-filter-ignore-commit-patterns`), and the 9 multi-select lists (their own slice, per the original plan - pending-selection seed variables need folding into Context state). **Slice 4 (2026-09-12):** migrated the six "Any (with/without)" plain-metadata selects (`filter-custom-comments`/`filter-other-notes`/`filter-pr-difficulty`/`filter-rally-stories`/`filter-rally-links`/`filter-analysis-of-pr`). Unlike every checkbox/text-input batch so far, **all** of `FilterOptionSelect.jsx`'s consumers migrate in this one slice (it has no other, unrelated usage the way `FilterCheckbox`/`RunScriptTextInput` did) - so it was migrated to Context in place via a new `filterStateKey` prop, rather than forking a parallel `ContextFilterOptionSelect`. The six read sites (`getCustomCommentsFilter`/etc. in `pr-filter-panel.component.js`) gained a new `getFilterStateValue` DI param (Context-key-keyed, not DOM-id-keyed like `FILTER_STATE_FIELD_MAP` elsewhere, since this factory's getters already know their own Context key directly) - handled/fallback shaped like every other bridge, wired at its `index.page.js` construction site. These six fields never had a persisted override to begin with (confirmed in `FilterOptionSelect.jsx`'s own pre-migration comment), so `FILTER_STATE_FIELD_MAP`/persist/restore/`FilterStateProvider`'s debounce-effect deps needed no changes at all this slice - the smallest-touch slice so far. Verified the same way as Slices 1-3: full jest suite (207 suites/1731 tests) and 3 full playwright runs (30/30) green; temporarily disabled `mountFilterStateProvider()` and re-ran the affected e2e tests (including "plain-metadata filter selects...actually filter the table") against the pure fallback mechanism - all passed. Real data confirmed untouched. Now 22 of 35 fields migrated - remaining: `filter-pr-numbers`, `attention-author-thread-resolution-mode`, the 2 special-case persist-on-change fields, and the 9 multi-select lists (their own slice, per the original plan). **Slice 5 (2026-09-12):** migrated `filter-pr-numbers` (`PrNumberFilterInput.jsx`, Phase 2's very first React conversion) and `attention-author-thread-resolution-mode` (`AuthorThreadResolutionModeSelect.jsx`). Both are in `debouncedApplyOnChangeIds`, so both needed adding to `FilterStateProvider`'s debounced-apply effect dependency list. `filter-pr-numbers`'s canonical read site is unusual - `renderPrData` (`pr-data-tab.orchestrator.js`) reads it directly (`filterPrNumbersInput.value.trim()`, no DI getter existed for it before), so this slice added a new optional `getFilterStateValue` param to that orchestrator (mirroring the shape already used elsewhere) rather than reusing an existing hook. `attention-author-thread-resolution-mode`'s dependent show/hide UI (`updateAuthorThreadResolutionRuleVisibility`) reads the same DOM element and was deliberately left untouched - confirmed in Phase 2 and reconfirmed here that a real DOM node's `.value` is always current regardless of whether Context or local state renders it, so only `getAuthorThreadResolutionPolicy` (the actual filtering-pipeline read) needed the Context-preferring treatment. Both fields' independent `createRoot()` mounts (`mountPrNumberFilterInput`/`mountAuthorThreadResolutionModeSelect`) were folded into `mountFilterStateProvider`'s portal tree and deleted. Added test coverage for the new orchestrator DI param (both the Context-value-present and fallback-to-DOM branches). Verified the same way as Slices 1-4: full jest suite (207 suites/1733 tests) and 3 full playwright runs (30/30) green; temporarily disabled `mountFilterStateProvider()` and re-ran every affected e2e test (including "PR-number filter input survives a persisted-value restore on page load" and "PR author thread resolution policy select shows/hides its dependent allow/deny lists live") against the pure fallback mechanism - all passed. Real data confirmed untouched. Now 24 of 35 fields migrated - remaining: the 2 special-case persist-on-change fields (`change-filter-use-builtin-merge-pattern`, `change-filter-ignore-commit-patterns`) and the 9 multi-select lists (their own slice, per the original plan - pending-selection seed variables need folding into Context state). **Slice 6 (2026-09-12):** migrated the last two "scalar" fields - `change-filter-use-builtin-merge-pattern` (checkbox, now `ContextFilterCheckbox`) and `change-filter-ignore-commit-patterns` (textarea, `IgnoreCommitPatternsTextarea.jsx`). Both auto-*persist*-on-change (not just apply) via their own special-case branch in the delegated `#run-script-form` listener - that branch stays completely untouched and still works correctly post-migration, since it reacts to the same real native "change" event a React-Context-controlled element still fires, the same "a real DOM node's value/events are correct regardless of what renders it" property Slice 5 already established. Both were added to `FilterStateProvider`'s debounced-apply deps for the usual double-hookup consistency, even though the delegated listener alone would have been sufficient. Persistence needed zero new plumbing for either: `getCheckbox`/`setCheckbox`/`setText` already checked `FILTER_STATE_FIELD_MAP` (added both ids there), and the textarea's own persist path (`parseCommitPatterns(textarea)`, form-parsing.helpers.js) reads `.value` directly off the real DOM node, already correct. **This was also the cleanup slice for now-fully-dead code**: with every one of `FilterCheckbox.jsx`'s consumers migrated to `ContextFilterCheckbox` across Slices 2/3/6, `FilterCheckbox.jsx`/`.test.jsx` and the now-empty `mountFilterCheckboxes` helper in react-app.jsx were deleted. Verified the same way as Slices 1-5: full jest suite (206 suites/1730 tests, one fewer suite than last slice from deleting `FilterCheckbox.test.jsx`) and 3 full playwright runs (30/30) green; temporarily disabled `mountFilterStateProvider()` and re-ran the affected e2e tests (including both "use built-in merge pattern" and "ignore commit patterns" auto-persist tests) against the pure fallback mechanism - all passed. Real data confirmed untouched. **Now 26 of 35 fields migrated - every field converts the same way except the 9 multi-select lists**, which get their own final slice (pending-selection seed variables need folding into Context state; this is the one category Phase 2 itself flagged as the most involved). **Slice 7 (2026-09-12), the multi-select lists - planned via a dedicated investigation pass first (see the approved plan at the time of this slice):** key finding before writing any code: the checked/selected state itself for all 9 lists is *not* vanilla-owned state needing migration - every populate function (`populateIncludeLabelOptions`/etc. in `pr-filter-panel.component.js`; `renderActorOptionsList`/`renderChangeFilterActorList` in `index.page.js`) recomputes "checked" fresh each call by reading the *currently-checked DOM checkboxes* (`getSelectedMultiSelectValues`/`getSelectedMultiSelectValuesFromList`, both live `querySelectorAll(":checked")` against `MultiSelectCheckboxList.jsx`'s real React-rendered inputs) - the same "a real DOM node stays correct regardless of what renders it" property established since Slice 1. `MultiSelectCheckboxList.jsx`'s remount-via-`key` design and `renderReactMultiSelectList`'s `flushSync` wrapping (`react-app.jsx`) were already exactly Phase 6's end-state for these lists - untouched this slice. The **one genuine piece of vanilla-owned state** was the 9 `let pendingXxxFilterSelections`/`_pendingChangeFilterIgnoreXAuthors` module variables (`index.page.js`) - each written once by `restoreUiOptionOverrides` (before any payload/checkboxes exist) and read once, as a fallback only when the DOM shows zero checked boxes, by its own list's populate function. Added two small shared helpers, `getPendingSelectionsValue`/`setPendingSelectionsValue` (Context-key-keyed rather than DOM-id-keyed like `FILTER_STATE_FIELD_MAP`, since none of these 9 have a corresponding DOM element), and rewired all 18 read/write call sites (5 DI getter/setter pairs into `pr-filter-panel.component.js`'s construction call, 4 inline closure reads/writes at the `renderActorOptionsList`/`renderChangeFilterActorList` call sites, and the 9 write sites inside `restoreUiOptionOverrides`) to go through them - zero changes needed inside `pr-filter-panel.component.js` itself (it only ever calls these as opaque functions already). **A real synchronization bug found and fixed during planning, before it shipped:** `restoreUiOptionOverrides` writes a pending variable and then, for the 4 "Family B" lists, *immediately* (same synchronous call, no tick in between) re-invokes the populate function that reads it back - the exact stale-batched-read problem `renderReactMultiSelectList`'s own `flushSync` already solves for a different reason. `FilterStateProvider`'s `window.setFilterStateValue` was a plain batched `setValues` call, so this same-tick read-after-write would have silently returned stale (pre-update) state once Context mounted. Fixed by wrapping `window.setFilterStateValue` in `flushSync` (`src/ui/state/FilterStateProvider.jsx`, importing it from `react-dom` the same way `react-app.jsx` already does) - this benefits every one of the 35 fields' write path, not just the 9 pending-selections, since any future same-tick read-after-write is now safe. Verified via a dedicated test (`FilterStateProvider.test.jsx`) that calls `window.setFilterStateValue` with no `act()`/tick and asserts `window.getFilterStateValues()` reflects it immediately; confirmed the test actually catches the regression by temporarily un-wrapping the `flushSync` call and watching it fail with the exact "stale value" mismatch, then restoring. Verified the whole slice the same way as Slices 1-6: full jest suite (206 suites/1731 tests) and 3 full playwright runs (30/30) green; temporarily disabled `mountFilterStateProvider()` and re-ran the 3 affected e2e tests (label; exclude-label/author/assigned/approver; thread-resolution allow/deny + change-filter ignore-authors) against the pure fallback (module-variable-only, no Context at all) mechanism - all passed, confirming the fallback is real. Real data confirmed untouched. **All 35 Run & Filter fields now read/write through `FilterStateProvider`'s Context, with vanilla fallback fully intact - Phase 6's field-by-field migration is complete.** What's left in Phase 6 (deliberately not started without a fresh ask, given the size/risk): removing the delegated `#run-script-form` listeners and vanilla debounce timer, `persistUiOptionOverrides`/`restoreUiOptionOverrides`'s now-redundant DOM-reading branches, and every vanilla fallback markup/branch across `index.html`/`pr-filter-panel.component.js`/`pr-author-insights.component.js`/`react-app.jsx` - all blocked on the bigger, separate decision to treat React as unconditionally available. **Vanilla fallback removal, Phase 3 slice (2026-09-13):** with the user's explicit sign-off to treat React as unconditionally available (accepting a brief empty/inert flash on ordinary page loads until React's deferred module mounts, since the fallback covered that race too, not just a broken-React safety net), removed the 5 handled/fallback branches in `pr-author-insights.component.js` (selector, header, comments, notes, created-PRs - each now calls its `updateReactAuthorInsightsXxx` bridge unconditionally; the wrapped vanilla builders `buildCreatedPrsSection`/`buildPrLinkedNotesSection`/`buildManualCommentsSection` themselves were kept, since the React ref-wrappers still call them), `renderStatsView`'s `hasReactApp` gate and `renderBackfillStatus`'s fallback branch (`index.page.js`), and deleted the now-fully-orphaned `pr-review-stats-controls.component.js`/`pr-review-stats-summary.component.js` (plus their tests) and the pre-existing dead `pr-author-insights.component.original.js`. Two things were identified up front and deliberately **not** touched, since they aren't fallback at all: the PR table's `viewprs:react-ready` re-render-once-mounted recovery mechanism, and the delegated `#run-script-form` "change" listener (load-order-safe event wiring plus the 2 special-case persist-on-change fields' immediate-persist behavior, neither replicated by Context's debounce effect). Broke 4 tests in the giant pre-existing jsdom suite `index.html.test.js` (which loads real `index.html` but never mounts real `react-app.jsx`, so it had always exercised 100% fallback behavior for every converted feature) - each triaged individually (one-line fix, e2e-redundant deletion, split-and-keep-the-still-valid-half, or ported to a more isolated unit test in `pr-author-insights.component.test.js`). Verified: full jest suite and 3 full playwright runs (30/30) green, plus a manual isolated-browser check (no revert-and-confirm-fallback-still-works check applies once fallback is truly deleted). Real data confirmed untouched. **Vanilla fallback removal, Phase 2 slice (2026-09-13):** removed the 26 Run & Filter fields' static vanilla fallback markup nested in each `#<id>-root` container in `index.html`, and simplified `mountFilterStateProvider`'s `initialValues` (react-app.jsx) to hardcoded defaults (matching `getUiOptionDefaults()`) instead of seeding from a fallback element's "currently showing" value, deleting the now-unneeded pre-portal `innerHTML = ''`-clearing step. This broke 75 tests in `index.html.test.js`, all traced to one shared root cause: `pr-data-tab.orchestrator.js`'s `renderPrData` has a guard (`if (!repoInput \|\| !filterPrNumbersInput) return;`) that bails out of rendering the *entire* page, not just filters, once those two elements don't exist anywhere - true for every test in this React-free jsdom harness once their static markup was deleted. Per explicit user instruction, fixed in the test harness rather than production code: added `injectRunFilterFieldElements()` to `index.html.test.js`, synthesizing the same 26 elements (matching the deleted markup's exact id/name/type/default attributes) directly into their `-root` containers, simulating what real React would mount - a no-op once real React does mount, and confirmed a no-op against the old markup too before it was deleted. Also surfaced and fixed two self-inflicted regressions found only via the real Playwright e2e suite (jsdom's suite doesn't fetch real `<script src>` tags or exercise real cross-script timing, so both stayed hidden from a fully-green jest run): (1) an earlier, overly-broad `git checkout -- src/ui/index.html src/ui/react-app.jsx` (run to revert a failed first attempt at this slice) reverted `index.html` all the way back to the last commit, silently re-introducing the 2 `<script>` tags for the Phase 3 slice's already-deleted `pr-review-stats-controls.component.js`/`pr-review-stats-summary.component.js` files (both files and their tags were correctly gone before the revert, since both were uncommitted edits to the same file) - caught via 2 `404`s failing the first smoke test's zero-failed-requests assertion, fixed by re-removing the 2 stale tags; (2) once those 404s were fixed, 7 "persisted-value restore" e2e tests still failed - root cause: `restoreUiOptionOverrides` (index.page.js) runs synchronously from a classic (non-deferred) `<script>` during HTML parsing, always before `react-app.jsx`'s deferred module has mounted `FilterStateProvider`, so every migrated field's `setFilterStateOverrideForFieldId` call was a no-op (no `window.setFilterStateValue` yet) - and, with the fallback markup gone, its `getOptionalElementById` fallback found nothing to mutate either, so the restore was silently dropped instead of merely falling back. Fixed the same way the PR table's own react-ready recovery already works: added a `{ once: true }` `viewprs:react-ready` listener (`index.page.js`, next to `restoreUiOptionOverrides`'s first call) that re-runs `restoreUiOptionOverrides` once React has actually mounted - idempotent with the first call, and picks up every migrated field's override for real. Verified: full jest suite (204 suites/1726 tests) and 3 full playwright runs (30/30) green throughout; real data confirmed untouched. **Vanilla fallback removal, Phase 1 slice (2026-09-14), scoped down:** a dedicated investigation pass first found Phase 1 was much bigger than Phase 2 - the giant jsdom integration suite (`index.html.test.js`, ~97 top-level test blocks) never mounts real React, so it always exercised the vanilla table-build fallback for every test, and roughly 20-30+ of those tests assert directly on real `<tr>` markup (with more relying on it indirectly for checkbox/Ack actions) - unlike Phase 2's static form fields, table rows are fully data-driven per test fixture, so there's no simple static-markup injection fix. Per the user's explicit choice to scope down rather than do a full removal, this slice only replaced the race-window fallback in `renderPrData` (index.page.js) - when React's deferred module hasn't loaded/mounted yet, it now runs the shared pipeline with `skipTableRender: true` (side effects only: data-meta summary, filter chips, export catalog, author insights, stats view, filter dropdown population) and leaves `#pr-sections` empty, relying on the pre-existing `viewprs:react-ready` listener to re-invoke `renderPrData` once React actually mounts - rather than building and immediately discarding a full vanilla table just to bridge that ordinary load-order race. The genuine mount-failure/callback-creation-failure vanilla-fallback branches further down the same function were deliberately left untouched, since those are real fault-tolerance for an actual React failure, not the race - matching the plan's established "recovery mechanism, not removable fallback" distinction. No vanilla table-build code was deleted (`appendPrSectionsSafe` and friends stay, still used by that real-failure path). Fixed the jsdom integration suite without rewriting any of its ~97 tests: stubbed `window.ReactMountBridge`/`window.mountReactPrTable` in `initTestPage()` so `renderPrData` sees React as "available," attempts a real mount, and has that mount deliberately fail (`createReactCallbacks()` naturally returns null in jsdom, since `window.ViewPrsReactCallbacksHelpers` was never loaded) - tripping the pre-existing, unmodified "mount failed" vanilla-fallback branch, which still builds the exact same full vanilla table the suite's assertions already depend on, the same way a real browser would if React genuinely failed to mount. Verified: full jest suite (204 suites/1726 tests, zero test rewrites needed) and 3 full playwright runs (30/30) green - notably, since every e2e test's initial page load itself passes through the real race window in a real browser before React mounts, this is already live confirmation the scoped design works end-to-end, not just a jsdom-only check. Real data confirmed untouched. **What's left of Phase 1** (deliberately not started, given the scope this investigation surfaced): removing the `skipTableRender`-gated vanilla table-build code itself from `pr-render-apply.helpers.js`, which would require the jsdom integration suite to actually mount a real (or realistically stubbed) React table per fixture rather than the mount-failure-stub trick used here - a substantially larger effort than this slice, not attempted. **Vanilla fallback removal, Phase 1 full-removal slice (2026-09-14):** a follow-up investigation found the full removal was "large but mechanical" after all - the React table tree (`PrTableApp`/`PrSection`/`PrRow`/cell components) was already proven jsdom-compatible via 45+ existing `.test.jsx` files and reuses the exact vanilla class names (`pr-number-cell`, `row-action-btn`, etc.), so deleted the vanilla table-build code entirely: `pr-section-table.component.js` (the `buildSectionTable`/cell-assembly file) and its now-solely-dependent `pr-section-shell.helpers.js`/`pr-section-render.helpers.js` (confirmed single-purpose via grep before deletion - a near-miss along the way: `pr-section-config.helpers.js`/`pr-smart-groups.helpers.js` were *also* initially deleted as apparently-vanilla-only, but turned out to be live runtime dependencies of `PrTableApp.jsx` itself, read via `window.ViewPrsSectionConfigHelpers`/`window.ViewPrsSmartGroupsHelpers` rather than `require()` - caught and restored before any real regression shipped). `renderPrData`'s two genuine mount-failure fallback branches (index.page.js) - previously falling back to a full vanilla table build, treating a real React failure the same as the merely-not-loaded-yet race the prior slice already handled - now show a minimal `renderPrTableMountError()` message instead: a real mount failure is essentially "React threw while rendering," which a one-shot vanilla snapshot wouldn't meaningfully recover from anyway (no live updates from the broken state going forward). Also fixed a real, previously-uncaught product bug found along the way: `PrTableApp.jsx`'s `checkNeedsAttention` only checked `shouldShowNeedsAttention()`, missing vanilla's second, independent condition (`isInReviewEnabled()`) for showing the "⚠️" icon - added `window.isInReviewEnabled` (index.page.js) and the matching OR-check, verified via a previously-passing-for-the-wrong-reason e2e-equivalent test. Getting the giant jsdom suite (`index.html.test.js`, 97 tests) to mount real React (via `@testing-library/react`'s own `render()`/`cleanup()`, not a hand-rolled `ReactDOM.createRoot()` bridge - an earlier hand-rolled version independently and imperfectly reinvented act()-wrapping and instance teardown that RTL already solves) surfaced a long tail of real, previously-invisible bugs in code no earlier slice had ever actually exercised under real React: a double-root corruption from a stale `loadStoredData()` promise leaking across this suite's own repeated `initTestPage()` calls (fixed with a one-tick `beforeEach` flush, matching the same pattern this suite's `afterEach` already used for a different stale-promise case); and, hardest to pin down, `@testing-library/user-event`'s multi-event `user.type()` sequences silently stopping short of reaching a text field's `onChange`/React state at all (DOM value updated, React state didn't) once enough of this suite's 97 tests had run and cycled enough React sessions through one shared jsdom window - root cause not fully isolated to a single line despite extensive tracing (including discovering a third-party console-log instrumentation tool in this environment that undermined some of the lower-level DOM/fiber inspection along the way), but reliably worked around by using `fireEvent.change()` (a single direct dispatch) instead of `user.type()` for the handful of text-field interactions in the two notes-editing tests where it surfaced. Verified: full jest suite (201 suites/1717 tests, zero known failures) and 3 full playwright runs (30/30) green, each stable across 3 consecutive runs. Real data confirmed untouched throughout. **This completes the vanilla-fallback-removal effort in full - Phase 6 has no remaining vanilla fallback markup, branches, or table-build code anywhere in the codebase.** **Post-completion follow-up (2026-09-15), pr-filter-panel/pr-json-modal cleanup:** at the user's explicit request, audited the remaining `.component.js` files for genuinely-dead vanilla DOM-building code (not just unmigrated fields). `pr-filter-panel.component.js` renamed to `pr-filter-panel.helpers.js` (its content was never React-component-shaped - stateless extraction/populate functions the React-owned multi-select fields already call into) and its 5 `if (!handled) { ...document.createElement... }` fallback blocks (one per multi-select list: label/exclude-label/author/assigned/approver) deleted outright - confirmed dead via the same reasoning already established for this migration: `window.renderReactMultiSelectList` (react-app.jsx) is set unconditionally once that module loads, with every one of this file's 5 list ids already present in `MULTI_SELECT_LIST_ID_PREFIXES`, so `handled` is always `true` past the brief startup race every other Phase 2/6 field already tolerates - the same always-available assumption Phase 6's own fallback-removal work already relied on. **One genuinely new conversion found and done along the way:** `renderManagementFilterSummary` (the "Applied filters: ..." summary line + chip list) was *not* one of the 35 originally-tracked fields - it predates Phase 2 entirely and had never been touched - but it was still hand-building `<span>` chip elements via `document.createElement` on every render. Converted to a real component, `AppliedFilterSummary.jsx`, mounted by a new `mountAppliedFilterSummary`/`renderReactFilterSummary` bridge pair in react-app.jsx (same handled/no-op-on-race shape as `renderReactMultiSelectList`), replacing index.html's standalone `<pre id="management-filter-summary">`/`<div id="management-filter-chips">` pair with a single `<span id="management-filter-summary-root">` the component renders both into. **`pr-json-modal.component.js` deleted entirely** (superseded by `PrJsonModal.jsx`, which has carried its own independent `summarizeDiffText`/`formatDiffSummaryLine`/`buildPrJsonModalAiClipboardText` reimplementation since the React conversion - confirmed via grep that nothing else required the vanilla factory), along with its own sole consumer `pr-json-modal.helpers.js` (orphaned by the same deletion, itself confirmed to have zero remaining references) and the now-pointless `window.openPrJsonModal` fallback branch in `PrActionsCell.jsx`'s `handleJsonClick` (`onViewJson` is unconditionally provided by `PrTableApp` in the real app, so the fallback was already unreachable in production, only exercised by its own unit test's explicit mock). **Broke, then fixed, 13 tests in `index.html.test.js`:** that suite never loads real `react-app.jsx` (see its own `installReactTableMountBridge` comment for why), so it had been silently exercising the now-deleted vanilla multi-select fallback for every multi-select-related test. Fixed by extending that suite's existing "reimplement just the bridge, not the whole module" pattern (already used for the PR table) with two new hand-rolled bridges - `installReactFilterPanelMountBridges` - that mount the real `MultiSelectCheckboxList`/`AppliedFilterSummary` components via RTL's `render()`/`rerender()` into the real containers, replicating react-app.jsx's exact synchronization details (an incrementing `key` forcing full remount on every populate call, and `flushSync` for the multi-select case) - the first version omitted both and caused 1 additional, more subtle failure (a stale-checked-state race) that only surfaced once the more obvious 12 were fixed, tracked down by comparing directly against react-app.jsx's real implementation rather than guessing. Verified: full jest suite (206 suites/1850 tests) green; live-checked against the running app-hub instance via Playwright (zero console errors/failed requests across a full page load, real `<input>` checkboxes confirmed rendering into `#label-list` etc. with correct ids, filter summary/chips rendering correctly, and the PR JSON modal still opens correctly with `onViewJson` alone, no fallback needed). |

**Total Estimated Time:** 120-160 hours (3-4 weeks)

---

# 🚀 **PHASE 1: Hybrid React Table**

## **Goal:** Replace PR table rendering with React while keeping everything else in vanilla JS

**Status:** All PR-table-rendering functionality works in the real Vite/React UI, verified with a headless browser (Playwright) against isolated fixture data, not just the jsdom unit suite. See "React Rendering Parity Fixes" below for what that verification actually found and fixed.

---

## ✅ **Completed Steps**

### **✅ Step 1.1: Project Setup** (COMPLETE)

**Time:** ~1 hour

**Completed:**
- ✅ Installed dependencies (Vite, React, concurrently)
- ✅ Created `vite.config.js`
- ✅ Updated package.json scripts (`dev`, `dev:server`, `dev:ui`, `build:ui`)
- ✅ Created React entry point (`react-app.jsx`)
- ✅ Updated `index.html` with React script tag
- ✅ **Added root `npm start` to run all servers** (root + view-prs with Vite)

**Setup verification:**
```bash
cd personal-scripts
npm install              # Install concurrently
cd view-prs
npm install              # Install React/Vite
npm start                # Starts Node (3455) + Vite (3456)
# Or from root:
cd personal-scripts
npm start                # Starts all servers
```

---

### **✅ Step 1.2: Create React Components** (COMPLETE)

**Time:** ~4 hours

**Components created:**
1. ✅ `PrTableApp.jsx` - Main container with state management
2. ✅ `PrSection.jsx` - Section wrapper (smart groups/lifecycle)
3. ✅ `SectionHeader.jsx` - Collapsible header with icons/count
4. ✅ `PrTable.jsx` - Table structure with row rendering
5. ✅ `PrRow.jsx` - Individual PR row (with `React.memo()` optimization)
6. ✅ `cells/PrTitleCell.jsx` - Title, number, badges, expand button
7. ✅ `cells/PrMetadataCell.jsx` - Author, CI status, labels
8. ✅ `cells/PrDateCell.jsx` - Two-line date display
9. ✅ `cells/PrActionsCell.jsx` - Checkboxes, Ack button
10. ✅ `PrInsightsRow.jsx` - Expandable insights details

**Component hierarchy:**
```
PrTableApp (container)
├── PrSection (smart group or lifecycle)
│   ├── SectionHeader (title, count, collapse)
│   └── PrTable (tbody wrapper)
│       └── PrRow (React.memo) (individual PR)
│           ├── PrTitleCell
│           ├── PrMetadataCell
│           ├── PrDateCell
│           ├── PrActionsCell
│           └── PrInsightsRow (expandable)
```

**Key optimizations:**
- `React.memo()` on `PrRow` - Only changed PRs re-render
- `useMemo()` on helper functions - Stable references
- Composite keys for multi-section support - Same PR can appear in multiple smart groups

---

### **✅ Step 1.3: Bridge Vanilla JS ↔ React** (COMPLETE)

**Time:** ~4 hours

**Completed:**
1. ✅ Created helper functions in `PrTableApp` (`getPrFlags`, `checkNeedsAttention`, `checkUserInteraction`)
2. ✅ Integrated with vanilla JS helpers via `window.ViewPrs*Helpers`
3. ✅ Wired smart groups with real logic (needs attention, user interaction detection)
4. ✅ Passed data through component tree (6 files modified)
5. ✅ Created React mount bridge (`react-mount-bridge.js`)
6. ✅ Created callback helpers (`react-callbacks.helpers.js`)
7. ✅ Updated HTML with script tags for bridge and callbacks
8. ✅ Added integration code to `index.page.js`:
   - `createReactCallbacks()` function (line 6808)
   - Updated `renderPrData()` to use React mount (line 6184)
9. ✅ Eliminated all placeholder data
10. ✅ **Fixed checkbox sync issue** - Callbacks now properly await toggle completion and trigger React re-render

**Data flow (end-to-end):**
```
Server Payload
  ↓
latestStoredPayload (vanilla JS)
  ↓
ReactMountBridge.mount()
  ↓
PrTableApp (React state)
  ↓
useMemo helpers → buildSections()
  ↓
PrRow (React.memo) → cells
  ↓
User clicks checkbox/Ack
  ↓
React callback
  ↓
Vanilla toggle function (await completion)
  ↓
Server POST → update payload
  ↓
ReactMountBridge.update()
  ↓
React re-renders changed rows
```

---

## 🟢 **Current Status: Parity-Verified, Performance Measured**

### **✅ Fixed Issues (original, Jan 2026):**

1. ✅ **404 Error on react-app.jsx**
   - **Issue:** Accessing via port 9000 (root server) instead of 3456 (Vite)
   - **Fix:** Added `npm run start:view-prs` to root package.json
   - **Better Fix:** Updated root `npm start` to run all servers with `concurrently`
   - **Access:** `http://localhost:3456` (Vite dev server)

2. ✅ **Checkbox Sync Across Sections**
   - **Issue:** Clicking checkbox didn't update same PR in other sections or smart groups
   - **Root Cause:** Getting payload before toggle function completed
   - **Fix:** Properly `await` toggle completion, then get updated payload
   - **File:** `view-prs/src/ui/helpers/react-callbacks.helpers.js`

---

## 🔍 **React Rendering Parity Fixes (Sept 2026)**

The jsdom test suite (1615 tests, all passing) cannot actually exercise the
React rendering path at all — `window.ReactMountBridge` doesn't exist in
jsdom, so every one of those tests runs against the vanilla fallback. The
suite being green said nothing about whether the real, React-rendered UI a
user actually sees was correct. Driving the real app with a headless
browser (Playwright, against isolated fixture data — see "E2E Testing"
below) found five real bugs the jsdom suite structurally could not have
caught, all now fixed and each covered by an e2e regression test:

1. **Duplicate PR rows.** `PrTableApp.jsx` read `config.rows` (the full,
   undeduplicated set — used only for section attention counts) instead of
   `config.renderRows` (added to `pr-section-config.helpers.js` to exclude
   rows already shown in a smart group). A PR that was both flagged and
   e.g. status=CHANGED rendered twice.
2. **"Apply filters (local)" did nothing to the actual table.** React
   received the full, unfiltered payload and recomputed its own
   `entriesForRepo` filtered only by repo — the vanilla-computed filtered
   PR-number set was never passed through. Only the `data-meta` summary
   text reflected the filter; the table kept showing everything. Fixed by
   threading the vanilla pipeline's filtered rows out through
   `renderPrData`'s return value → `visiblePrNumbers` prop.
3. **"Request more" merged-PRs button was entirely absent.** It was only
   ever appended while building the vanilla `<table>` DOM — a step skipped
   entirely under React. Fixed by giving it its own static sibling element
   in `index.html` (outside the container React owns), so the vanilla
   pipeline can always render into it regardless of which backend draws
   the table.
4. **The "PR update in progress" spinner never showed.** It's driven by a
   scheduler-status poll loop separate from the main render cycle, so it
   couldn't reuse the `visiblePrNumbers` plumbing. Fixed with a
   `pr-active-progress-update` CustomEvent that `PrTableApp` listens for,
   threading a plain boolean `isActive` prop down to `PrNumberCell` so
   `PrRow`'s `React.memo()` still only re-renders the one row that changed.
5. **"View in table" from Author Insights silently broke.** It scrolled to
   the row correctly but expanded insights by directly mutating
   `.hidden`/`textContent`/`aria-expanded` on the DOM — which left the
   toggle button claiming "expanded" while React's own `expandedInsights`
   state (and therefore the actual content) never changed. Fixed by
   dispatching a `pr-navigate-to-insights` CustomEvent instead, handled via
   `PrTableApp`'s own state, when React is mounted.

**The pattern behind all five:** vanilla computes or mutates something as
a side effect of building its own `<table>` DOM, and that side effect was
either skipped outright (`skipTableRender`) or only worked when vanilla
itself owned the DOM node being touched. Any *other* code that still
directly manipulates `#pr-sections` DOM, or that assumes vanilla's render
pipeline ran, is worth checking against this same pattern before trusting
it works under React.

**Investigated and confirmed NOT a bug:** whether an incoming payload
update (e.g. from an unrelated poll) could wipe an in-progress, unsaved
note edit, since `recomputeDirtyPrSectionsFields`'s auto-render-blocking
check is also skipped under React. Verified live: it isn't at risk — notes
editing is local `useState` inside `NotesSection.jsx`, initialized once via
a lazy initializer, so it survives re-renders as long as the component
doesn't unmount (which a same-`key` payload update doesn't trigger). This
is actually more robust than vanilla's approach, not less.

---

## 🎭 **E2E Testing (Playwright)**

Added `@playwright/test` as a dev dependency specifically because the bugs
above are invisible to jsdom. `npm run test:e2e` runs a small (9-test)
smoke suite in `e2e/smoke.spec.js` against a real Vite + Express server
pair, driven by headless Chromium.

**Critical safety detail:** the app has no fixture-data concept of its
own — by default it reads/writes the developer's real `data/` directory,
including real PR flagged/in-review/ack tracking state. `playwright.config.js`
isolates every test run into a fresh temp directory via `VIEW_PRS_*` env
vars **and** a plain `DATA_DIR` env var (the two are independent — the
Express server reads `VIEW_PRS_DATA_FILE`/`VIEW_PRS_USER_STATE_FILE` etc.,
but `check-open-pr-updates.sh`, spawned for checkbox/Ack/"Run script"
actions, has its own separate `DATA_DIR` env var and silently falls back to
the real `data/` directory if it's not set). Both must be set for a test
run to be truly isolated — this cost a real (data/check-open-pr-updates.user-state.json)
mutation during development to discover. `reuseExistingServer` is also
deliberately always `false`, even locally, so a developer's own running
`npm run dev` session can never get silently reused by a test run.

Fixture data lives in `e2e/fixtures/{data.json,user-state.json}` — a
small, synthetic `octocat/hello-world` repo, not real PR data.

Keep this suite deliberately small: it exists to catch what jsdom
structurally cannot (broken static asset paths, charset/encoding issues,
vanilla-vs-React DOM ownership conflicts), not to duplicate the jsdom
suite's interaction coverage.

---

## ✅ **Performance Validation (measured 2026-09-11)**

The numbers below were never actually measured before this — the "15-19x
faster" figures earlier in this doc were pre-implementation guesses, not
real timings. Real measurement found a genuinely faster React path, but
**not** the pattern originally guessed: the speedup neither reaches
double digits nor shrinks as more PRs change per update. Both are
explained by what the measurement revealed about where the time actually
goes.

**Methodology:** `renderPrData` (the single entry point both the real
polling delta path and checkbox-toggle path call) auto-detects React via
`window.mountReactPrTable` and either calls `window.ReactMountBridge.update`
(React) or `prDataTabOrchestrator.renderPrData` (vanilla, full rebuild) -
exactly the branch a real update takes. Measured both branches through
this same entry point by: (1) normal page load for the React branch, (2)
a page load with `react-app.jsx` network-blocked (so `mountReactPrTable`
is never defined and every render takes the vanilla branch) for the
vanilla branch - a true apples-to-apples comparison of the same code path
decision the app itself makes, not a reimplementation. Each call was
timed with `performance.now()` before the call and two chained
`requestAnimationFrame` callbacks after (to capture commit + paint, not
just the synchronous portion - the same technique this section originally
suggested), against synthetic fixtures of 50 and 500 PRs, mutating N of
them (title + `updatedAt`) before each call to simulate "N PRs changed."
7 repeats per scenario; medians reported. This required a temporary,
non-committed debug hook (`window.__perfRenderPrData` etc., added and
reverted via `git checkout` in the same session - never landed in a
commit) to reach `renderPrData` and the current payload from outside the
page, since neither is otherwise exposed.

**Results (median of 7 runs):**

| Dataset | PRs changed | Vanilla | React | Speedup |
|---------|-------------|---------|-------|---------|
| 50 PRs  | 1           | 51.0ms  | 33.9ms | 1.5x |
| 50 PRs  | 3           | 47.7ms  | 31.9ms | 1.5x |
| 50 PRs  | 10          | 46.2ms  | 31.5ms | 1.5x |
| 50 PRs  | 50 (all)    | 44.5ms  | 32.3ms | 1.4x |
| 500 PRs | 1           | 800.6ms | 209.8ms | 3.8x |
| 500 PRs | 3           | 762.3ms | 193.6ms | 3.9x |
| 500 PRs | 10          | 765.7ms | 195.8ms | 3.9x |
| 500 PRs | 50          | 745.1ms | 194.1ms | 3.8x |

**What this actually shows:**
1. **React is real, meaningfully faster - 1.4-1.5x at 50 PRs, 3.8-3.9x at
   500 - and the gap widens with total dataset size**, as expected: React
   reconciles the table instead of vanilla's full `innerHTML` rebuild, and
   that gap matters more the bigger the table gets.
2. **The speedup does not scale with delta size** (1 vs 50 PRs changed)
   the way the original guess assumed, in either direction - it's flat
   within each dataset size. Root cause, visible directly in
   `renderPrData` (`index.page.js`): **both** branches unconditionally
   re-run the *entire* vanilla pipeline (`prDataTabOrchestrator.renderPrData`
   with `skipTableRender: true` for React, or without it for vanilla) for
   every single render regardless of delta size - it recomputes the
   data-meta summary, filter chips, filter dropdown options, author
   insights panel, and stats view from *all* entries every time, not just
   the changed ones. That shared, delta-size-independent cost dominates
   both paths' timing, which is exactly why neither path's numbers move
   between "1 changed" and "50 changed" at a given dataset size. React's
   `React.memo`-based row-skipping (confirmed working - unchanged PR
   entries keep their object identity through `mergeDataDeltaPayload`'s
   spread, see `pr-data-polling.helpers.js`) is real, but it's shaving
   time off a relatively small fraction of the total (the table build
   itself), not off the dominant shared-pipeline cost.
3. **The original "15-19x for 3 changed, 1.8-2x for all changed" shape
   was never realistic for this codebase** given (2) - it assumed React
   would skip re-deriving everything else too, which it structurally
   cannot while `renderPrData` keeps running the full side-effect
   pipeline on every render. Closing that gap (making the shared pipeline
   itself delta-aware, or skipping the parts that didn't change) is a
   real, identified optimization opportunity for **Phase 5 (Performance
   Tuning)** - not attempted here, since it touches the core render path
   for every already-converted field and is out of scope for "measure
   it."

**Not separately measured:** the "click checkbox" scenario goes through
the identical `renderPrData`/`ReactMountBridge.update` machinery as the
delta scenarios above (via `handleCheckboxChange` in
`react-callbacks.helpers.js`), just triggered differently - the "1 PR
changed" row for each dataset size above is a reasonable proxy rather
than a separately measured number.

---

## 📦 **Phase 1 Deliverables**

✅ **Working hybrid React table**
- PR table rendered by React
- Filters/controls still vanilla JS
- Local filters (PR-number/label/author/assigned/approver/scope) verified
  to actually restrict the React-rendered table, not just the summary text

✅ **Zero known regressions**
- jsdom suite: 1615/1615 passing
- Playwright e2e suite: 9/9 passing, against the real React UI
- Five real vanilla/React parity bugs found via browser testing, all fixed
  and each covered by an e2e regression test (see above)

⬜ **Performance metrics** — not yet measured (see "Not Yet Done" above); the 15-19x figure is the original design target, not a verified result

✅ **Production-ready**
- Build process configured (`npm run build:ui`)
- Error handling in place
- Fallback to vanilla JS if React fails

---

## 🚨 **Known Issues & Solutions**

### **Issue 1: React 404 Error**

**Symptom:**
```
GET http://localhost:9000/react-app.jsx 404 (Not Found)
[renderPrData] React not available, using vanilla rendering
```

**Cause:** Accessing page via wrong port (9000 instead of 3456)

**Solution:**
```bash
# From root:
cd personal-scripts
npm start  # Starts all servers including Vite

# Access via:
http://localhost:3456  # Vite dev server (NOT 9000)
```

---

### **Issue 2: Checkbox Doesn't Sync Across Sections**

**Symptom:** Clicking checkbox updates only one section, not all instances

**Cause:** Getting payload before toggle function completes

**Solution:** Already fixed in `react-callbacks.helpers.js`
```javascript
// Properly await toggle completion:
await toggleInReviewForRowSafe(entry, row, checked, mockCheckbox);

// THEN get updated payload:
const payload = getLatestStoredPayloadSafe();
updateReactTableSafe(payload, repo);
```

---

## 📚 **Development Workflow**

### **Starting Development:**

```bash
# Option 1: From root (recommended)
cd personal-scripts
npm start

# Option 2: From view-prs
cd personal-scripts/view-prs
npm start

# Access:
http://localhost:3456
```

### **Building for Production:**

```bash
cd view-prs
npm run build:ui

# Output: view-prs/dist/ui/
```

### **Running Tests:**

```bash
cd view-prs
npm test                    # All tests
npm test -- --watch         # Watch mode
npm run test:coverage       # With coverage
```

---

## 🎯 **Future Phases (Brief Overview)**

### **Phase 2: Filters & Controls** (20-30 hours) — 🟡 Started

**Goal:** Migrate filter controls to React

**Approach (per the first slice below):** incrementally, one control at a
time, the same way Phase 1 itself worked — not a Context-based rewrite of
the whole form up front. Each converted field keeps its original `id` so
every existing vanilla `getElementById`/`addEventListener` call keeps
working unmodified; only who *renders* the DOM node changes. This worked
cleanly for one text input; whether it still holds up for stateful
controls like the multi-select dropdowns (which vanilla currently builds
and repopulates from payload data — see `pr-filter-panel.component.js`) is
untested and should be re-evaluated before assuming the same pattern
applies as-is.

**✅ Done:**
- `<PrNumberFilterInput />` ("Filter by PR number(s)") — `src/ui/components/PrNumberFilterInput.jsx`,
  mounted by `mountPrNumberFilterInput()` in `react-app.jsx` into a
  `#filter-pr-numbers-root` container (`index.html`) that falls back to a
  plain `<input>` if React never mounts.
- `<ScopeFilterSelect />` ("View scope") — `src/ui/components/ScopeFilterSelect.jsx`,
  mounted the same way into `#scope-mode-root`. Confirmed the pattern
  generalizes from `<input>` to `<select>` (with one addition — see gotcha
  #1 below).
- `<AlwaysShowInReviewCheckbox />` ("Always show PRs In Review") —
  `src/ui/components/AlwaysShowInReviewCheckbox.jsx`, mounted into
  `#always-show-in-review-root`, nested inside vanilla's own
  `<label class="checkbox-row">` (unconverted) so label-click-toggles-
  checkbox and layout are unaffected. Confirmed the pattern generalizes to
  checkboxes: `setCheckbox()` in `index.page.js` now calls `element.click()`
  when restoring a persisted value that differs from the current
  `checked` state, instead of assigning `.checked` directly — the
  checkbox equivalent of `setText()`'s native-setter-plus-event trick.
- `<AttentionNoActivityModeSelect />` ("NO_ACTIVITY handling") —
  `src/ui/components/AttentionNoActivityModeSelect.jsx`, mounted into
  `#attention-no-activity-mode-root`.
- `<FilterCheckbox />` (originally named `AttentionRuleCheckbox`, renamed
  once it outgrew that scope — see below) — a single **generic,
  parameterized** component (`id`/`name`/`initialChecked` props), not one
  near-duplicate file per field, mounted via the generic
  `mountFilterCheckboxes(fields)` in `react-app.jsx`. Used for two
  unrelated batches of plain checkboxes: the five "Needs Attention rules"
  checkboxes (`attention-include-pending-comments`,
  `attention-ignore-merge-only-commits`, `attention-include-closed-merged`,
  `attention-include-draft-changed`, `attention-include-draft-no-activity`)
  and the three "Run Script options" checkboxes (`ack-changed`,
  `show-reason`, `quiet`). Use this as the template for any other batch of
  near-identical checkboxes rather than one-off components.
- `<AuthorThreadResolutionModeSelect />` ("PR author thread resolution
  policy") — `src/ui/components/AuthorThreadResolutionModeSelect.jsx`,
  mounted into `#attention-author-thread-resolution-mode-root`. Has
  dependent UI (two sibling `<details>` elements that show/hide based on
  the selected mode); needed no extra handling beyond gotcha #3's fix
  below, since the vanilla code driving that already read `.value` fresh
  each time rather than caching it.
- `<RunScriptTextInput />` — a single **generic, parameterized** component
  (`id`/`name`/`type`/`placeholder`/`initialValue` props) for the four
  plain "Run Script options" text/number fields: `repo`, `limit`,
  `merged-limit`, `jobs`. Mounted by `mountRunScriptTextInputs()` into
  their respective `#<id>-root` containers. Unlike every field above, none
  of these ever had a vanilla `"change"` listener attached in the first
  place — they're only read via `.value` when the "Run script" button is
  clicked (`persistRunScriptOptionOverrides` / `handleRunScript` in
  `index.page.js`) — so gotcha #3 below doesn't apply to this batch; only
  the restore-race handling (gotcha #1) was needed.
- `<OpenModeSelect />` ("Open mode") — `src/ui/components/OpenModeSelect.jsx`,
  mounted into `#open-mode-root`. Same reasoning as `RunScriptTextInput`
  above: no pre-existing `"change"` listener, only read on "Run script"
  click, so only the restore-race handling applied.
- `<MultiSelectCheckboxList />` ("Filter by label name(s)", `#label-list`)
  — the first multi-select dropdown converted, and structurally different
  from every field above: its *options* are rebuilt from the PR payload on
  every data (re)load (`populateIncludeLabelOptions` in
  `pr-filter-panel.component.js`), not seeded once at mount. React mounts
  directly into the existing `<div id="label-list">` container (like Phase
  1's `#pr-sections`), not a wrapper span, so the pre-existing "change"
  listener delegated on that stable container (added long before Phase 2
  existed) and the `getSelectedMultiSelectValues`/`updateMultiSelectSummary`
  DOM-querying helpers all kept working completely unmodified. Wired via a
  new optional `renderMultiSelectList(listId, items)` DI hook on
  `createPrFilterPanelComponent` — returns `false` (triggering the
  untouched vanilla DOM-building fallback) for any list id not yet
  converted or if React hasn't mounted yet, so every other multi-select and
  every existing unit test for this module keeps working unchanged. See
  gotcha #4 below for the one real bug this surfaced.
- Four more `<MultiSelectCheckboxList />` mounts, converting every
  remaining multi-select in `pr-filter-panel.component.js` the same way:
  **"Exclude by label name(s)"** (`#exclude-label-list`,
  `populateExcludeLabelOptions` — structurally identical to label-list),
  and **"Filter by PR author(s)" / "Assigned user(s)" / "PR approver(s)"**
  (`#author-list` / `#assigned-list` / `#approver-list`,
  `populateAuthorOptions` / `populateAssignedOptions` /
  `populateApproverOptions`) — these three differ from label/exclude-label
  in deriving both the checkbox `value` (a login) and its display `label`
  from `actorsMap` (`resolveActorDisplayName`) rather than using the same
  string for both, and originally used plain `${prefix}-${login}` checkbox
  ids instead of the indexed/slugified `getMultiSelectCheckboxId` scheme —
  harmless to change since nothing reads these ids directly (only
  `getSelectedMultiSelectValues`' DOM query on `:checked`, unaffected by
  id format). Same `renderMultiSelectList` DI hook, same fallback
  behavior, same `flushSync`-wrapped bridge in `react-app.jsx` (just an
  additional `MULTI_SELECT_LIST_ID_PREFIXES` entry per list — no new
  bridge code needed). E2e coverage combines all four into one batch test
  (`smoke.spec.js`) as recommended below, rather than duplicating the
  label-list test four times.
- The final four `<MultiSelectCheckboxList />` mounts — **"Allow/Deny PR
  authors to resolve threads started by"** (`#attention-author-thread-
  resolution-allow-list` / `-deny-list`, `renderActorOptionsList`) and
  **"Ignore comments/reviews from these authors"**
  (`#change-filter-ignore-comment-authors-list` /
  `-review-authors-list`, `renderChangeFilterActorList`) — complete every
  multi-select dropdown in the app. These four are the one structurally
  different case in this batch: built directly as local closures inside
  `index.page.js` itself (not `pr-filter-panel.component.js`), so the
  `window.renderReactMultiSelectList` bridge call (with the same
  handled/fallback branching as the DI hook everywhere else) is inlined
  directly into `renderActorOptionsList`/`renderChangeFilterActorList`
  rather than threaded through as an injected parameter — same bridge,
  same `flushSync` fix, different call site. Restoring these four uses two
  different override shapes worth knowing about for e2e/manual testing:
  the thread-resolution allow/deny lists are top-level array keys
  (`overrides["attention-author-thread-resolution-allow"]`), while the
  change-filter ignore-author lists nest under `overrides.changeFilters`
  (`ignoreCommentsFromAuthors`/`ignoreReviewsFromAuthors`) alongside the
  `useBuiltinMergePattern` checkbox and `ignoreCommitPatterns` textarea
  (both converted below) — see `restoreUiOptionOverrides` in
  `index.page.js`.
- `<FilterOptionSelect />` — a single **generic, parameterized** component
  (`id`/`name`/`options`/`initialValue` props, `options` an
  `{value, label}` array) for the six near-identical "Any (with/without)"
  selects: Custom comments, Other notes, PR difficulty, Rally stories,
  Rally links, Analysis of PR. Mounted by `mountFilterOptionSelects()`
  into their respective `#<id>-root` containers, seeded from
  `FILTER_OPTION_SELECT_FIELDS` in `react-app.jsx`. Same category as
  `RunScriptTextInput`/`OpenModeSelect`: none of these six ever had a
  vanilla `"change"` listener or a persisted override (only read via
  `.value` when "Apply filters (local)" is clicked), so only the standard
  restore-race handling applied - no event delegation, no `flushSync`.
  **Discovered - and then fixed - while testing this batch**: none of
  these six fields had ever actually filtered the table, a pre-existing
  bug unrelated to this conversion (`git log` showed "prDifficulty" had
  never appeared in `pr-filter-pipeline.helpers.js`'s history) -
  `deriveFilterPipelineState` read their values into
  `filterSelectionInputs` but never forwarded them into
  `buildRowFilterCriteria`, so `rowMatchesUiFilters` always saw
  empty-string criteria for all six regardless of what was selected.
  Fixed by adding `customComments`/`otherNotes`/`prDifficulty`/
  `rallyStories`/`rallyLinks`/`analysisOfPr` to
  `deriveFilterPipelineState`'s destructured params and threading them
  into its `buildRowFilterCriteriaSafe(...)` call
  (`pr-filter-pipeline.helpers.js`) - the one real call site
  (`pr-render-filter-summary.helpers.js`) already spread
  `...filterSelectionInputs` into that call, so no caller needed
  updating, just the function that was silently dropping them. Verified
  by temporarily reverting the fix and confirming both the new unit test
  (`pr-filter-pipeline.helpers.test.js`) and the updated e2e test failed
  as expected. The e2e fixture (`e2e/fixtures/user-state.json`) now gives
  PR #1 a `prDifficulty: "3"` note, the one differentiator among the three
  fixture PRs, so `"...actually filter the table"` can assert real
  filtering instead of just interaction/persistence round-tripping.
- `<FilterCheckbox />` mounted a tenth time, for **"Use built-in merge
  commit filter"** (`#change-filter-use-builtin-merge-pattern`) - the last
  checkbox in the tab. Unlike the run-script/attention-rule checkboxes,
  this one has its own special-case auto-persist-on-change behavior (a
  real PUT fires immediately on toggle, not just on "Apply filters
  (local)"), previously wired via a direct, un-delegated
  `addEventListener` - exactly the gotcha #3 shape. Fixed the same way as
  `attention-author-thread-resolution-mode`'s special case: added a
  dedicated branch to the delegated `#run-script-form` listener (checked
  *before* the generic `debouncedApplyOnChangeIds` set) instead of folding
  it into that set, since it needs to persist immediately, not just
  re-filter. Verified by temporarily removing that branch and confirming
  the new e2e test failed as expected.
- `<IgnoreCommitPatternsTextarea />` — **the last field in the Run &
  Filter tab**, "Ignore commits matching patterns (regex, one per line)"
  (`#change-filter-ignore-commit-patterns`), and the only `<textarea>`
  converted so far. Same gotcha #3 shape as the merge-pattern checkbox
  above (special-case auto-persist-on-change, added to the same delegated
  branch rather than `debouncedApplyOnChangeIds`) - verified by temporarily
  removing it and confirming the new e2e test failed. Also required
  fixing `restoreUiOptionOverrides`'s restore path for this field, which
  used a plain `textarea.value = ...` assignment instead of `setText`
  (native setter + dispatched events) - the same class of bug gotcha #1
  describes for `<input>`/`<select>`, just never hit before because this
  was the first `<textarea>` converted. `HTMLTextAreaElement` has its own
  "value" accessor property (distinct from `HTMLInputElement`'s), so
  `setNativeValueAndDispatch`'s prototype-descriptor lookup needed no
  changes to work for it. This specific ordering (restore arriving after
  React has already mounted) proved hard to force deterministically
  through the e2e suite's real network/timing - see
  `IgnoreCommitPatternsTextarea.test.jsx`'s "external native value change"
  test for the reliable, deterministic proof this technique is needed.
  **With this field converted, the entire Run & Filter tab is now
  React-owned.**

**⚠️ Real gotchas this surfaced — read before converting the next field:**
1. `index.page.js`'s `restoreUiOptionOverrides()` fetches a persisted
   filter value on page load and can resolve *before* `react-app.jsx` (a
   Vite-bundled ES module — slower to load than a small same-origin JSON
   fetch) finishes mounting. Two fixes were both needed, not just one:
   - `restoreUiOptionOverrides`'s `setText()` helper now writes through
     the native value setter and dispatches **both** a real `input` *and*
     `change` event (see `setNativeValueAndDispatch` in `index.page.js`),
     instead of a plain `element.value = ...` assignment — needed for
     when React mounts *first* and the restore arrives after, since a
     controlled React field won't otherwise notice an externally-assigned
     `.value`. `<input>` only strictly needed `input`; `<select>` needed
     `change` too, so both fire unconditionally now.
   - Each `mount*()` function reads the fallback element's *current*
     value as `initialValue` before mounting — needed for the reverse
     ordering, where restore wins the race and sets the fallback element
     before React replaces it (mounting with a hardcoded default
     `initialValue` would otherwise silently wipe out the just-restored
     value).
2. **This suite's tests are not independent** — every test shares one
   long-lived webServer and one `user-defaults.json` (see
   `playwright.config.js`'s isolation comment). Once gotcha #1 was fixed,
   restoring a persisted filter started *actually re-applying it* on page
   load (previously the restored value only looked right in the form; the
   table itself silently stayed unfiltered, since nothing had ever told
   it to re-run). That's a real correctness fix, but it means any test
   that persists a filter via "Apply filters (local)" and doesn't clean up
   afterward now silently filters the *next* test's fresh page load too.
   Every such test must reset the field back to its default and wait for
   the real persistence PUT to land (`clickApplyFiltersAndWaitForPersist`
   in `smoke.spec.js`) before finishing — a fixed `waitForTimeout` isn't
   reliable, since the persist call is fire-and-forget
   (`void persistViewFilterOptionOverrides()`). Even with cleanup, running
   these tests **in parallel** is still a lost-update race (concurrent
   GET-merge-PUT against the same file) — `playwright.config.js` sets
   `fullyParallel: false` / `workers: 1` for exactly this reason. Don't
   re-enable parallelism without addressing this.
3. **The big one — this silently broke "auto-apply on change" for every
   field converted so far, all at once, not just one.** `index.page.js`
   attaches its `"change"` → `debouncedApplyFilters` (and, for a few
   fields, persist) listeners directly to each field via
   `element.addEventListener(...)`, early during page load (a classic
   script, run *before* `react-app.jsx`'s deferred module graph finishes
   loading and mounts). `ReactDOM.createRoot(container).render(...)` then
   creates a **fresh DOM node** for that field — it does not hydrate or
   reuse the static/fallback node — silently orphaning any listener
   already attached to the old node. The field kept working when changed
   *and then* "Apply filters (local)" was clicked (that button has its
   own separate handler, unaffected), which is why every earlier test in
   this file didn't catch it - they all click that button. Changing a
   field alone, the way a real user mostly does, silently did nothing:
   no debounced re-filter, no dependent-UI update (the thread-resolution
   select's show/hide), no auto-persist. **Fixed by delegating these
   listeners on `<form id="run-script-form">`** (a stable ancestor never
   replaced by React, since React only mounts into the small per-field
   `<span id="...-root">` containers nested inside it) instead of on each
   field directly — the native `"change"` event still bubbles up to the
   form regardless of which side rendered the field that changed. See the
   delegated listener in `index.page.js` (search for
   `debouncedApplyOnChangeIds`) and in
   `pr-ui-option-scroll.helpers.js`'s `registerUiOptionPersistenceHandlers`.
   **Any future field conversion must land inside this same delegated
   listener's field-id set (or the equivalent) — never re-add a direct
   `addEventListener` on a field that Phase 2 has converted or will
   convert.**

4. **Multi-select-specific — React's non-synchronous commit clobbered a
   restored selection, and only a real-browser reload could catch it.**
   `renderPrData`'s React path (`index.page.js`) calls the vanilla
   filter-population pipeline *twice* per data load:
   `prDataTabOrchestrator.renderPrData(..., skipTableRender: true)` runs it
   once as a side effect, then `populateFilterDropdownsForCurrentPayload`
   (added earlier, for the React path's own dropdown-population needs)
   runs it again right after. Both calls read "currently checked"
   checkboxes back out of the DOM (`getSelectedMultiSelectValues`) to seed
   the *next* populate call's selections — harmless when both calls
   mutate the DOM directly and synchronously (true for every multi-select
   still on the vanilla path), but `ReactDOM.createRoot(container).render()`
   does **not** commit synchronously (React 18 batches it). Without
   forcing a synchronous commit, the second call's DOM read saw the first
   call's pre-commit (stale/unchecked) state and cleared a selection that
   had just been correctly restored, before the very first paint after a
   page reload. Fixed by wrapping the render call in `flushSync` (from
   `react-dom`, see `renderReactMultiSelectList` in `react-app.jsx`) so the
   DOM synchronously reflects each render before the function returns,
   matching the read-after-write contract every non-React caller already
   assumes. This is the first gotcha in this list the jsdom suite plus a
   single-load browser check could **not** have caught — it only manifests
   on a *second* consecutive populate call within the same page load, which
   requires either a real reload or (as used to confirm the fix) two
   Playwright script runs comparing behavior with/without `flushSync`. See
   the e2e test `"React-owned label multi-select renders options from
   payload data..."` in `smoke.spec.js`, which reloads the page and asserts
   the checkbox is still checked — confirmed to fail without `flushSync`.
   **Any future multi-select conversion must render through this same
   `flushSync`-wrapped bridge function, not a bare `root.render()`.**

Confirm all four still hold (or find the equivalent) for every future
field conversion — this is exactly the kind of vanilla/React desync bug
the "React Rendering Parity Fixes" section above catalogs, self-inflicted
this time by Phase 2 work rather than found in Phase 1's leftovers. See
the e2e tests `"React-owned PR-number filter input survives a
persisted-value restore on page load"`, `"React-owned scope <select>
survives a persisted-value restore..."`, `"changing a React-owned filter
auto-applies without clicking..."`, `"PR author thread resolution
policy select shows/hides its dependent allow/deny lists live..."`, and
`"React-owned label multi-select renders options from payload data..."`,
`"React-owned exclude-label/author/assigned/approver multi-selects
render from payload data..."`, `"React-owned thread-resolution
allow/deny and change-filter ignore-author multi-selects render and
survive a persisted restore..."`, and `"React-owned change-filter \"use
built-in merge pattern\" checkbox auto-persists on change..."` in
`e2e/smoke.spec.js`, and the corresponding `*.test.jsx` files for the
unit-level version of gotcha #1 (both directions of that race).

**Original plan (component breakdown) — superseded, kept for history:**
every field this originally sketched (and every other field in the tab
besides) is now converted; see the field-by-field "✅ Done" list above for
the actual component names and file locations rather than this stale
aspirational list.

**State management — decided (2026-09-11), not deferred-and-forgotten:**
all three original items here (Context for global state, removing vanilla
JS filter variables, migrating debounce logic to hooks) are explicitly
**not** being pursued as part of Phase 2. The incremental,
`id`-preserving approach needed no Context for any of the 35 fields
converted, precisely because vanilla stays the source of truth for
filter-application logic (`applyFiltersFromCache`/`debouncedApplyFilters`)
and every React field just mirrors it via the restore-race/event-
delegation/`flushSync` bridges documented above. "Removing the vanilla
variables" and "migrating debounce to hooks" would mean tearing out that
shared source of truth and rebuilding it as React state (almost certainly
requiring Context, since filter state is read from many unrelated
components) - a large, high-risk rewrite touching every converted field's
bridge at once, explicitly out of scope for Phase 2 and deferred to
**Phase 6 (Remove Vanilla JS)**, where it belongs alongside removing the
vanilla fallback markup itself. Revisit only if Phase 6 is actually
started, not before.

---

### **Phase 3: Other Tabs** (20-30 hours) — 🟡 Started

**Tabs to migrate, roughly in order of complexity (chosen 2026-09-11 after
looking at each):**
1. **Review Stats Tab** (`#pr-stats`) — moderate complexity: its own
   orchestrator (`review-stats-tab.orchestrator.js`, though only its
   `initialize()` is actually wired up from `index.page.js` — the rest
   of its API, `render`/`handleDateRangeChange`/`handleFilterChange`/
   `updateData`/`activateTab`/`cleanup`, is currently dead code, never
   called from anywhere), a controls component (converted, see below), a
   summary/table component, and chart visuals
   (`pr-review-stats-chart/visuals.component.js`) plus 3 aggregation/
   timeline/date-bucketing helper files. Renders a dynamic table from PR
   data - the same shape Phases 1-2 already proved out.
2. **Author Insights Tab** (`#author-insights`) — most complex: a
   dedicated component + orchestrator + 5 helper files
   (`pr-author-insights-identity/drafts/pr-link/display/data.helpers.js`).
3. **Backfill Tab** (`#backfill-card`) — simplest (mostly static markup
   with live status/log text updates via polling, no real list-rendering
   to speak of), but also the worst natural fit for React and lowest
   value - do last, if at all.

**✅ Done (Review Stats tab, slice 1 of 2 so far):**
- `<ReviewStatsControls />` — the sort/filter/minComments/topN/start-date/
  end-date controls, replacing
  `pr-review-stats-controls.component.js`'s `createStatsControls()`.
  `statsViewState` (a plain module-level object in `index.page.js`) has no
  persisted/restored override and is only ever written by these controls
  themselves - confirmed by grepping every `statsViewState.` write site
  before converting - so this mounts once with the current
  `statsViewState` as `initialState` and owns it from then on; no
  restore-race handling needed (unlike almost every Phase 2 field).
  - **The one real gotcha, and it's Phase 1's `#pr-sections` gotcha all
    over again, just in a new tab:** `renderStatsView` (index.page.js)
    used to rebuild its *entire* content — controls included — via a
    single `host.innerHTML = ""` on every stats render (the exact
    discard-and-rebuild shape the old vanilla multi-select lists had
    before Phase 2 converted those). Once React mounts into a container
    inside that subtree, an unrelated stats re-render (e.g. switching
    tabs and applying an unrelated PR filter, which cascades into
    `renderStatsView` regardless of which tab is visible) would silently
    tear the React root's DOM out from under it via that same
    `innerHTML = ""`, without ever calling `root.unmount()` - React's own
    bookkeeping would think it's still mounted while its DOM is gone.
    Fixed by giving the controls a separate static sibling container
    (`#stats-controls-root`, alongside a new `#stats-content-root` for
    everything else) in `index.html`, and updating `renderStatsView` to
    only ever rebuild `#stats-content-root` - `#stats-controls-root` is
    never touched once React has mounted into it (a `hasReactApp` check,
    same pattern as `renderPrData`'s own React-vs-vanilla branch, guards
    a vanilla fallback that still rebuilds it the old way if React never
    loaded).
  - **A second, smaller gotcha specific to this component:**
    `minComments`/`topN` must commit (call the `onChange` bridge prop,
    which mutates `statsViewState` and calls the expensive
    `applyFiltersFromCache()` to re-render) only on blur, matching the
    original vanilla control's native `"change"` handler - not on every
    keystroke, which is what React's `onChange` alone would do for a
    text-entry `<input>`. The component tracks the raw typed value
    separately (`onChange` → local state only) from the committed value
    (`onBlur` → clamped + sent to vanilla), otherwise every keystroke
    while editing would re-trigger a full stats recompute and fight the
    user's typing.
  - Verified both gotchas are real regressions the tests actually catch:
    temporarily reverted each fix and confirmed the corresponding test
    failed - see the e2e test `"React-owned Review Stats controls
    render, respond to changes, and survive an unrelated stats
    re-render"` (`smoke.spec.js`), which tags the mounted `<select>`
    DOM node with a custom marker attribute and asserts it survives an
    unrelated re-render (checking only the *displayed value* survived
    isn't enough - vanilla's rebuild reads the same `statsViewState` and
    would show the same value too, so the test's first draft passed even
    with the bug still present; only a DOM node identity check actually
    distinguishes "React survived" from "vanilla silently rebuilt an
    equivalent-looking replacement"), and
    `ReviewStatsControls.test.jsx`'s "onChange has not fired" /
    "onChange fires once on blur" tests for the second gotcha.

**✅ Done (Review Stats tab, slice 2 of 2 so far):**
- `<ReviewStatsContent />` — summary cards (with per-card "Show sources"
  native `<details>`), the chart-visuals wrapper, the reviewer table (with
  per-row "Show sources" toggle via React state, since a `<tr>` can't use
  native `<details>`), the "Showing N of M reviewers..." summary note, and
  the activity trend note - replacing
  `pr-review-stats-summary.component.js`'s `renderStatsSummaryAndTable()`
  entirely. Mounted once into `#stats-content-root` and updated via
  `window.updateReviewStatsContent(stats, rows, actorsMap)` - the same
  mount-once/update-via-bridge shape as Phase 1's
  `mountReactPrTable`/`updateReactPrTable` (pure derived display data, no
  persisted override to restore), not the restore-race pattern most of
  Phase 2 used.
  - **Chart visuals were deliberately not reimplemented in JSX.**
    `createStatsVisuals` (`pr-review-stats-visuals.component.js` +
    `pr-review-stats-chart.component.js`, ~900 lines of hand-rolled
    SVG/DOM chart building) is still called as-is; `<StatsVisuals />` just
    wraps it via a `ref` + `useEffect` that clears the container and
    appends whatever DOM node the vanilla builder returns. Rewriting that
    much custom charting logic in JSX would be a disproportionate lift for
    this slice - the same "leave it to vanilla where React's diffing
    wouldn't add real value" reasoning as Phase 2's state-management
    decision, applied here instead of to the whole tab at once.
  - **Found and fixed a real, pre-existing bug, not just a port:** the
    "View in table" button inside a stat card's expandable sources built
    its own ad hoc navigation inline - `activateDataTab("pr-data")` then a
    `setTimeout` that directly mutated `.hidden`/`aria-expanded` on the PR
    table's insights row. That's exactly the same unsafe-under-React
    pattern Author Insights' own "View in table" button already hit and
    was fixed for (see `navigateToPrInTable` in
    `pr-author-insights-pr-link.helpers.js`, which dispatches a
    `'pr-navigate-to-insights'` CustomEvent for `PrTableApp` to handle via
    its own state when React owns the table) - Review Stats' copy was
    simply never updated the same way. `<ReviewStatsContent />` calls a
    new `window.navigateToPrInTableFromStats` bridge that delegates to
    that same already-fixed helper instead of rebuilding (a third copy
    of) the broken version. Confirmed working end-to-end with a real
    browser (screenshot showing the PR data tab activated and the
    insights row genuinely expanded, not just the toggle button claiming
    so) and with the e2e test `"React-owned Review Stats content renders
    cards/table and \"View in table\" navigates to the React-owned PR
    table correctly"`.
  - Two new bridges were added narrowly rather than reusing existing
    global ones: `window.reviewStatsFormatIsoDatetime` (not
    `window.formatIsoDatetime`, which `PrDateCell.jsx` already reads with
    a much cruder fallback - reusing that name here would have changed
    Phase 1's already-shipped date formatting as an unintended side
    effect of this Phase 3 work) and `window.navigateToPrInTableFromStats`
    (not the module-level `navigateToPrInTable` name already in scope in
    `index.page.js`, which is a *different*, unrelated function from
    `pr-auto-render-navigation.helpers.js` with a different signature -
    reusing that name would have been a real naming collision, not just a
    style choice).
  - One e2e test-writing lesson worth remembering: the toggle-expanded
    assertion needed the same `toHaveJSProperty("hidden", false)` +
    `ancestor::tr`/`following-sibling::tr` technique the existing Author
    Insights "View in table" test already uses, *not*
    `expect(...).toBeVisible()` - the target PR can legitimately end up
    inside a currently-collapsed lifecycle/smart-group section depending
    on what earlier tests in this shared-webServer suite did to its
    flagged/in-review state, and `toBeVisible()` fails on that ancestor
    collapse even when the feature under test is working correctly. The
    first draft of this test passed in isolation but failed intermittently
    as part of the full suite for exactly this reason.

**✅ Done (Author Insights tab, slice 1 of several):**
- `<AuthorInsightsSelector />` — the "Author" dropdown, replacing
  `pr-author-insights.component.js`'s `renderAuthorSelector()`. Same shape
  as Phase 2's `MultiSelectCheckboxList` / Review Stats' own multi-select
  precedent, not `ReviewStatsControls`'s shape: this selector's *options*
  are rebuilt from the PR payload on every author-insights render (new
  authors can appear as data changes), so it's mounted once but updated
  via `window.updateAuthorInsightsSelector(options, selectedLogin)` with
  an incrementing `key` on every call, fully re-initializing from fresh
  props each time rather than diffing - matching the old vanilla
  behavior of discarding and rebuilding the `<select>` from scratch on
  every render.
  - **Same container-split gotcha as Review Stats, applied to a third
    container:** `renderAuthorInsights` used to rebuild the selector via
    the *same* `host.innerHTML = ""` that rebuilt the selected-author
    header and every section - given `#author-insights` (like
    `#pr-stats` before it) has no natural "no rebuild needed" boundary of
    its own, React mounting into any part of that subtree needed the
    same static-sibling-container treatment
    (`#author-insights-selector-root` / `#author-insights-content-root`)
    `renderStatsView` already got. Verified by temporarily merging the
    two containers back into one `host.innerHTML = ""` call and
    confirming the e2e test failed - and more severely than expected:
    the selector didn't just lose its selected value on a later
    re-render, it vanished from the page entirely (even before any
    re-render), because `mountAuthorInsightsSelector`'s `createRoot`
    call had already captured a reference to the original
    `#author-insights-selector-root` node, which the merged
    `innerHTML = ""` immediately detached on the very first render.
  - This is now the third time this exact class of bug has appeared
    (Phase 1's `#pr-sections`, Review Stats' `#stats-controls-root`, now
    this) - a strong signal that "does the vanilla rebuild this
    container is going into already cover something else, or could it
    ever need to?" is worth checking explicitly for *every* remaining
    Author Insights section (comments composer/list, PR-linked notes,
    created-PRs) before converting each one, not just assumed safe by
    analogy.
  - The DI contract for `createPrAuthorInsightsComponent` gained one new
    optional parameter, `updateReactAuthorInsightsSelector` (handled/
    fallback shape, same as `pr-filter-panel.component.js`'s
    `renderMultiSelectList` hook) - every existing unit test, which
    doesn't pass it, keeps exercising the unchanged vanilla fallback path.

**Approach for the rest of Review Stats, and for Author Insights /
Backfill when they're picked up:**
- Continue one slice at a time, same as Phases 1-2 - don't attempt a
  whole tab in one shot.
- Before converting any container that a vanilla render function
  currently rebuilds via `innerHTML = ""`, check whether that rebuild
  covers (or will come to cover, once React owns part of it) anything
  React has mounted into - give React-owned pieces their own static
  sibling container the vanilla rebuild is scoped away from, exactly
  like `#stats-controls-root` above and `#pr-sections` in Phase 1. This
  is the single most common way this migration has broken things so far
  (Phase 1's original #pr-sections issue, several of Phase 2's gotchas,
  and this one) - always check for it explicitly rather than assuming a
  new tab's rebuild pattern is safe by default.
- `useMemo`/`React.lazy()` as originally suggested here remain reasonable
  ideas for the heavier pieces (chart visuals, Author Insights) once
  there's an actual component to measure, not upfront.

---

### **Phase 4: Testing & Quality** (20-30 hours)

**Tasks:**
- Migrate all 1,400+ tests to React Testing Library
- Add E2E tests with Playwright
- Performance testing (Lighthouse, bundle size)
- Long-session stability testing

---

### **Phase 5: Performance Tuning** (10-20 hours)

**Optimizations:**
- Code splitting (lazy load tabs)
- Memoization audit (`useMemo`, `useCallback`)
- Bundle optimization (tree shaking, manual chunks)

---

### **Phase 6: Cleanup** (10-20 hours)

**Tasks:**
- Remove vanilla JS code
- Optional: TypeScript migration
- Documentation updates
- Final performance validation

---

## ✅ **Success Criteria**

**Phase 1 is complete when:**

✅ React loads without errors  
✅ All PRs render correctly  
✅ Checkboxes sync across all sections  
✅ Smart groups update immediately  
✅ Lifecycle badges appear correctly  
✅ More Insights expand/collapse works  
✅ Delta updates are faster (1.4-1.5x at 50 PRs, 3.8-3.9x at 500 PRs - see "Performance Validation" above for real numbers, not the originally-guessed 15-19x)  
✅ All 1,400+ tests pass  
✅ No visual regressions  
✅ Production build works  

---

## 📈 **Performance Targets**

| Metric | Vanilla (measured) | React (measured) | Notes |
|--------|--------|--------|-------|
| Delta update, 1-50 PRs changed (50-PR dataset) | 44.5-51.0ms | 31.5-33.9ms | **1.4-1.5x**, flat across delta size - see "Performance Validation" above |
| Delta update, 1-50 PRs changed (500-PR dataset) | 745.1-800.6ms | 193.6-209.8ms | **3.8-3.9x**, flat across delta size |
| Bundle size | 150KB | <500KB | **Measured 2026-09-12** (after Phase 3): `npm run build:ui`'s React entry chunk (`main-*.js`, everything under `react-app.jsx` - all 20+ converted components) is 230.62 kB raw / 69.61 kB gzip, well under target. The vanilla `index.page.js`/helpers/components/orchestrators stay classic (non-module) scripts per index.html's own `<script src>` tags, so they aren't part of this bundle at all - only counted once Phase 6 migrates them into the module graph. **Re-measured 2026-09-15** (post Phase 4/5/6 completion): **232.39 kB raw / 70.19 kB gzip** - a small (~0.8%) increase from incidental `PrTableApp.jsx` edits since (`pr-entry-derived-cache.helpers.js` itself is a classic script, not part of this module bundle); still well under target |
| Initial load | 200ms | <600ms | **Measured 2026-09-12** (Vite dev server, isolated fixture data, 3-PR dataset, headless Chromium via CDP `Performance.getMetrics`): steady-state `load` event fires at **164-174ms** (first run in a fresh dev-server process was 426ms, Vite's on-demand transform of the first request - not representative; every run after is fast, since Vite caches the transformed modules) |
| Memory usage | 10MB | <50MB | **Measured 2026-09-12**, same run: steady-state JS heap (`JSHeapUsedSize`) is **~11MB** after initial render, well under target |
| Test coverage | 98% | >95% | Maintain quality |

---

## 📞 **Getting Help**

**Resources:**
- [React Documentation](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [React Testing Library](https://testing-library.com/react)
- [React DevTools](https://react.dev/learn/react-developer-tools)

**Troubleshooting:**
- Check browser console for errors
- Use React DevTools to inspect component tree
- Verify servers are running (Express on port 9000, Vite on port 3456)
- Check you're accessing `http://localhost:3456`

---

**Last Updated:** 2026-09-11
**Phase 1 Progress:** Functionally complete, parity-verified in a real browser; performance not yet formally measured
**Next Milestone:** Phases 1 and 2 are both complete, including Phase 1's performance measurement (see "Performance Validation" above). Move on to Phase 3 (Other Tabs: Author Insights, Backfill, Review Stats), or Phase 5 (Performance Tuning) to chase the identified optimization opportunity (making the shared render-pipeline side effects delta-aware). Phase 2's state-management cleanup remains deferred to Phase 6, not a blocker
