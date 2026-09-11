# React Migration Plan - Phases 1 & 2 Complete

## 🎯 **Overview**

Migrating view-prs from vanilla JavaScript to React in phases, starting with the PR table component for maximum performance impact with minimal risk.

**Key Principle:** Incremental migration with working software at each phase

**Expected Performance:** 19x faster delta updates (1530ms → 80ms for 3 changed PRs) — not yet formally measured, see "Not Yet Done" below

---

## 📋 **Phase Breakdown**

| Phase | Component | Time | Status |
|-------|-----------|------|--------|
| **Phase 1** | PR Table (Hybrid) | 30-40h | 🟢 **Functionally complete — parity-verified in a real browser** |
| **Phase 2** | Filters & Controls | 20-30h | 🟢 **Complete** — every field in the Run & Filter tab is React-owned, 35 fields total (PR-number input, 4 selects, 10 checkboxes, 4 plain text/number inputs, 6 "Any (with/without)" plain selects, 1 textarea, all 9 multi-select dropdowns). Found and fixed two systemic bugs, each affecting every field of its kind converted so far at once — see gotcha #3 (orphaned "auto-apply on change" listeners, fixed via event delegation) and gotcha #4 below (multi-select restore-race clobbered by React's non-synchronous commit, fixed via `flushSync`). Also found and **fixed** a pre-existing, unrelated bug while testing the six plain selects: `deriveFilterPipelineState` never forwarded customComments/otherNotes/prDifficulty/rallyStories/rallyLinks/analysisOfPr into the real row-filtering criteria, so those six fields never actually filtered anything despite looking functional - now wired through. Some filter-dropdown compatibility work also landed alongside Phase 1 (see git history: "Fix dropdown auto-population", "Update attention rules and options"). **Decision (2026-09-11):** the original "remove vanilla JS filter variables / migrate debounce to hooks" items are explicitly deferred to Phase 6 rather than pursued here — vanilla staying the source of truth for `applyFiltersFromCache` (with React fields just mirroring it) is what made 35 fields convertible incrementally without Context or a state rewrite; unwinding that now would be a large, high-risk change touching every field's bridge code at once, for a goal ("filters render/behave via React") this phase already achieves |
| **Phase 3** | Other Tabs | 20-30h | ⬜ Not Started |
| **Phase 4** | Testing & Cleanup | 20-30h | 🟡 jsdom suite at 1615/1615; a Playwright e2e smoke suite now exists too (see below) |
| **Phase 5** | Performance Tuning | 10-20h | ⬜ Not Started |
| **Phase 6** | Remove Vanilla JS | 10-20h | ⬜ Not Started |

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

## 🟢 **Current Status: Parity-Verified, Performance Not Yet Measured**

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

## 🎯 **Not Yet Done**

### **Performance Validation**

**Measure delta update performance:**

```javascript
// Add to index.page.js:
const measureDeltaUpdate = (payload) => {
  const start = performance.now();
  
  if (window.updateReactPrTable) {
    window.updateReactPrTable(payload);
  } else {
    renderPrData(payload);
  }

  requestAnimationFrame(() => {
    const duration = performance.now() - start;
    console.log(`[Performance] Delta update: ${duration.toFixed(2)}ms`);
  });
};
```

**Expected results:**

| Scenario | Vanilla JS | React (Target) | Improvement |
|----------|------------|----------------|-------------|
| 3/50 PRs changed | 1530ms | <100ms | **15-19x faster** |
| 10/50 PRs changed | 1580ms | <200ms | **8-10x faster** |
| All 50 PRs changed | 1600ms | <900ms | **1.8-2x faster** |

**Test scenarios:**
1. Click checkbox (1 PR changes)
2. Auto-refresh with 3 changed PRs
3. Auto-refresh with 10 changed PRs
4. Full reload (all PRs change)

**Verify with React DevTools Profiler:**
1. Open React DevTools
2. Go to "Profiler" tab
3. Start recording
4. Click checkbox
5. Stop recording
6. Verify only 1 `PrRow` re-rendered

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

### **Phase 3: Other Tabs** (20-30 hours)

**Tabs to migrate:**
1. Author Insights Tab
2. Backfill Tab
3. Review Stats Tab

**Approach:**
- Create tab components
- Use `useMemo` for expensive calculations
- Lazy load tabs with `React.lazy()`

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
✅ Delta updates are 15-19x faster  
✅ All 1,400+ tests pass  
✅ No visual regressions  
✅ Production build works  

---

## 📈 **Performance Targets**

| Metric | Before | Target | Notes |
|--------|--------|--------|-------|
| Delta update (3 PRs) | 1530ms | <100ms | **19x improvement** |
| Delta update (50 PRs) | 1600ms | <900ms | **1.8x improvement** |
| Bundle size | 150KB | <500KB | Acceptable for React |
| Initial load | 200ms | <600ms | Vite dev server overhead |
| Memory usage | 10MB | <50MB | React Virtual DOM overhead |
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
**Next Milestone:** Phases 1 and 2 are both complete. Either measure/document Phase 1 performance (Step "Performance Validation" above) or move on to Phase 3 (Other Tabs: Author Insights, Backfill, Review Stats). Phase 2's state-management cleanup is deferred to Phase 6, not a blocker (see "State management" above)
