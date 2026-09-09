# React Migration Plan - Phase 1 In Progress

## 🎯 **Overview**

Migrating view-prs from vanilla JavaScript to React in phases, starting with the PR table component for maximum performance impact with minimal risk.

**Key Principle:** Incremental migration with working software at each phase

**Expected Performance:** 19x faster delta updates (1530ms → 80ms for 3 changed PRs)

---

## 📋 **Phase Breakdown**

| Phase | Component | Time | Status |
|-------|-----------|------|--------|
| **Phase 1** | PR Table (Hybrid) | 30-40h | 🟡 **In Progress (75%)** |
| **Phase 2** | Filters & Controls | 20-30h | ⬜ Not Started |
| **Phase 3** | Other Tabs | 20-30h | ⬜ Not Started |
| **Phase 4** | Testing & Cleanup | 20-30h | ⬜ Not Started |
| **Phase 5** | Performance Tuning | 10-20h | ⬜ Not Started |
| **Phase 6** | Remove Vanilla JS | 10-20h | ⬜ Not Started |

**Total Estimated Time:** 120-160 hours (3-4 weeks)  
**Time Invested:** ~12 hours  
**Remaining (Phase 1):** ~8-12 hours  

---

# 🚀 **PHASE 1: Hybrid React Table** (CURRENT)

## **Goal:** Replace PR table rendering with React while keeping everything else in vanilla JS

**Time Estimate:** 30-40 hours  
**Progress:** 75% complete  
**Expected Result:** 19x faster delta updates  

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

## 🟡 **Current Status: Testing Phase**

### **✅ Fixed Issues:**

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

## 🎯 **Next Steps (Remaining ~8-12 hours)**

### **Step 1.4: Test React Integration** (~2-4 hours)

**Test checklist:**

#### **Visual Verification:**
- [ ] Sections render (smart groups + lifecycle)
- [ ] PRs populate correctly
- [ ] Icons show (🚩👁️⚠️💬)
- [ ] Lifecycle badges appear in smart groups
- [ ] Needs attention icons (⚠️)
- [ ] Styling matches vanilla version

#### **Interaction Testing:**
- [ ] Click "Flagged" checkbox → updates all instances
- [ ] Click "In Review" checkbox → updates all instances
- [ ] PRs appear in smart groups immediately (no 30s delay)
- [ ] PRs disappear from smart groups immediately
- [ ] Click "Ack" button → toggles state
- [ ] Expand/collapse sections → works
- [ ] Expand "More Insights" → shows details
- [ ] Collapse "More Insights" → hides details

#### **Performance Testing:**
- [ ] Open React DevTools
- [ ] Verify `PrRow` has `memo` wrapper
- [ ] Click checkbox → only one row re-renders
- [ ] Check delta updates (should be ~19x faster)

#### **Console Verification:**
```
✅ [ReactBridge] Bridge initialized
✅ [renderPrData] Using React rendering
✅ [React Migration] React PR table mounted successfully
❌ No errors
❌ No 404s
```

---

### **Step 1.5: Feature Preservation** (~2-4 hours)

**Verify all features work:**

#### **Smart Groups:**
- [ ] 🚩 Flagged - Shows flagged PRs
- [ ] 👁️ In Review - Shows in-review PRs
- [ ] ⚠️ Needs Attention - Shows PRs needing attention (excludes closed)
- [ ] 💬 Interacted With - Shows PRs user interacted with (open/draft only)

#### **Lifecycle Sections:**
- [ ] Open PRs - Shows open PRs
- [ ] Draft PRs - Shows draft PRs
- [ ] Latest Merged PRs - Shows recently merged
- [ ] Closed PRs - Shows closed PRs

#### **Lifecycle Badges:**
- [ ] Badges appear ONLY in smart groups
- [ ] Correct section shown (OPEN/DRAFT/MERGED/CLOSED)
- [ ] Pill-shaped styling (subtle)
- [ ] Color matches section (green/gray/purple/red)

#### **Date Columns:**
- [ ] Line 1: PR activity (merge/close/commit date)
- [ ] Line 2: Viewer activity (baseline timestamp)
- [ ] Relative time format ("2 hours ago")

#### **More Insights:**
- [ ] Composite keys work (`section:prNumber`)
- [ ] Same PR can have different insights state in different sections
- [ ] Expand/collapse state persists correctly

---

### **Step 1.6: Unit Tests** (~2-4 hours)

**Install testing dependencies:**
```bash
cd view-prs
npm install --save-dev \
  @testing-library/react@^14.0.0 \
  @testing-library/jest-dom@^6.1.0 \
  @testing-library/user-event@^14.5.0
```

**Create component tests:**

#### **Test 1: PrRow renders correctly**
```jsx
import { render, screen } from '@testing-library/react';
import { PrRow } from '../PrRow';

test('renders PR number and title', () => {
  const pr = {
    number: 123,
    title: 'Test PR',
    authorLogin: 'testuser',
    // ... other fields
  };

  render(
    <table><tbody>
      <PrRow
        pr={pr}
        sectionKey="open"
        isSmartGroup={false}
        isExpanded={false}
        needsAttention={false}
        isFlagged={false}
        isInReview={false}
        onToggleInsights={() => {}}
        onCheckboxChange={() => {}}
        onAckAction={() => {}}
      />
    </tbody></table>
  );

  expect(screen.getByText(/Test PR/)).toBeInTheDocument();
  expect(screen.getByText(/#123/)).toBeInTheDocument();
});
```

#### **Test 2: Checkbox changes trigger callback**
```jsx
test('checkbox change calls onCheckboxChange', async () => {
  const handleChange = jest.fn();
  const pr = { number: 123, title: 'Test' };

  render(
    <table><tbody>
      <PrRow
        pr={pr}
        onCheckboxChange={handleChange}
        // ... other props
      />
    </tbody></table>
  );

  const checkbox = screen.getByLabelText(/Flagged/);
  await userEvent.click(checkbox);

  expect(handleChange).toHaveBeenCalledWith(123, 'flagged', true);
});
```

#### **Test 3: React.memo prevents unnecessary re-renders**
```jsx
test('PrRow does not re-render when unrelated props change', () => {
  const { rerender } = render(<PrRow pr={pr1} {...props} />);
  const renderCount = countRenders(PrRow);

  // Change unrelated prop
  rerender(<PrRow pr={pr1} {...props} unrelatedProp={newValue} />);

  expect(renderCount).toBe(1); // Should not re-render
});
```

#### **Test 4: Integration - Delta updates**
```jsx
test('updates React table on delta change', async () => {
  const { container } = render(
    <PrTableApp
      initialPayload={initialData}
      selectedRepo="owner/repo"
      onCheckboxChange={() => {}}
      onAckAction={() => {}}
    />
  );

  // Simulate delta update
  const deltaPayload = { ...initialData, /* changed PR */ };
  act(() => {
    window.updateReactPrTable(deltaPayload);
  });

  await waitFor(() => {
    expect(screen.getByText(/Updated PR/)).toBeInTheDocument();
  });
});
```

**Run tests:**
```bash
npm test -- --testPathPattern=PrRow
```

---

### **Step 1.7: Performance Validation** (~2-4 hours)

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

When Phase 1 is complete, we should have:

✅ **Working hybrid React table**
- PR table rendered by React
- Filters/controls still vanilla JS
- Delta updates 15-19x faster

✅ **Zero regressions**
- All existing features preserved
- All tests passing (1,400+)
- No visual changes

✅ **Performance metrics**
- Documented performance improvements
- Before/after measurements
- React DevTools profiling data

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
- Verify servers are running (ports 3455 + 3456)
- Check you're accessing `http://localhost:3456`

---

**Last Updated:** 2025-01-08  
**Phase 1 Progress:** 75% complete  
**Next Milestone:** Complete testing and validation (~8-12 hours)
