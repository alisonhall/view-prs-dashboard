# React Migration Plan - Phase 1 Functionally Complete

## 🎯 **Overview**

Migrating view-prs from vanilla JavaScript to React in phases, starting with the PR table component for maximum performance impact with minimal risk.

**Key Principle:** Incremental migration with working software at each phase

**Expected Performance:** 19x faster delta updates (1530ms → 80ms for 3 changed PRs) — not yet formally measured, see "Not Yet Done" below

---

## 📋 **Phase Breakdown**

| Phase | Component | Time | Status |
|-------|-----------|------|--------|
| **Phase 1** | PR Table (Hybrid) | 30-40h | 🟢 **Functionally complete — parity-verified in a real browser** |
| **Phase 2** | Filters & Controls | 20-30h | 🟡 Some filter-dropdown work already landed alongside Phase 1 (see git history: "Fix dropdown auto-population", "Update attention rules and options") |
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

### **Phase 2: Filters & Controls** (20-30 hours)

**Goal:** Migrate filter controls to React

**Components to create:**
- `<RepoSelector />`
- `<ScopeFilter />`
- `<AttentionFilters />`
- `<MultiSelectFilters />`
- `<PrNumbersFilter />`

**State management:**
- React Context for global state
- Remove vanilla JS filter variables
- Migrate debounce logic to React hooks

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
**Next Milestone:** Either measure/document Phase 1 performance (Step "Performance Validation" above), or move on to Phase 2 (Filters & Controls), some of which has already started
